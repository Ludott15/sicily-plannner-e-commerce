import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  templateFacts,
  publishChecks,
  type CheckStop,
  type Pace,
  type PublishCheck,
  type PublishCover,
} from "@/lib/itinerary-checks";
import { dbAdmin } from "@/server/db/admin";
import { activities, areas, itineraries, itineraryItems, itineraryNights, places } from "@/server/db/schema";

// Controlli di pubblicazione di un itinerario pronto, letti dal database con dbAdmin dentro la
// transazione chiamante (saveTemplate) o da sola (adminGetTemplate). La logica dei controlli è
// pura (src/lib/itinerary-checks.ts): qui si leggono i dati e si passano.

export type AdminTx = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];

type CoverCheck = PublishCover;

// Copertina come la vede il pubblico: solo un media usabile. Una foto di bene culturale con
// autorizzazione scaduta non conta, e la catena passa all'anello successivo.
function usableCoverJson(mediaId: unknown) {
  return sql<CoverCheck | null>`(
    select jsonb_build_object('kind', m.kind, 'altIt', m.alt_it)
    from public.media m
    where m.id = ${mediaId}
      and (m.authorization_id is null or exists (
        select 1 from public.image_authorizations ia
        where ia.id = m.authorization_id and ia.valid_until >= current_date
      ))
  )`;
}

function areaUsableCoverJson(placeAreaId: unknown) {
  return usableCoverJson(sql`(select a.cover_media_id from public.areas a where a.id = ${placeAreaId})`);
}

const templateColumns = {
  id: itineraries.id,
  title: itineraries.title,
  slug: itineraries.slug,
  days: itineraries.days,
  subtitle: itineraries.subtitle,
  description: itineraries.description,
  seasonMonths: itineraries.seasonMonths,
  suitableFor: itineraries.suitableFor,
  pace: itineraries.pace,
  dayTitles: itineraries.dayTitles,
  dayIntros: itineraries.dayIntros,
  coverMediaId: itineraries.coverMediaId,
};

async function loadTemplateRow(tx: AdminTx, itineraryId: string) {
  const [row] = await tx
    .select(templateColumns)
    .from(itineraries)
    .where(and(eq(itineraries.id, itineraryId), eq(itineraries.isTemplate, true)));
  return row ?? null;
}

// Tappe con i dati dell'attività e dell'area, in ordine di giorno e posizione: una query sola.
async function loadStopRows(tx: AdminTx, itineraryId: string) {
  return tx
    .select({
      id: itineraryItems.id,
      dayIndex: itineraryItems.dayIndex,
      position: itineraryItems.position,
      timeSlot: itineraryItems.timeSlot,
      startTime: itineraryItems.startTime,
      notes: itineraryItems.notes,
      customTitle: itineraryItems.customTitle,
      activityId: activities.id,
      activityTitle: activities.title,
      activityIsActive: activities.isActive,
      activityDurationMin: activities.durationMin,
      activitySeasonMonths: activities.seasonMonths,
      activityOnSitePriceEur: activities.onSitePriceEur,
      activityRequiresCar: activities.requiresCar,
      placeId: places.id,
      placeName: places.name,
      placeAreaId: places.areaId,
      areaNameIt: areas.nameIt,
      areaNameEn: areas.nameEn,
    })
    .from(itineraryItems)
    .leftJoin(activities, eq(activities.id, itineraryItems.activityId))
    // Una voce ha un'attività oppure solo un luogo: il luogo dell'attività se manca quello della voce.
    .leftJoin(places, eq(places.id, sql`coalesce(${itineraryItems.placeId}, ${activities.placeId})`))
    .leftJoin(areas, eq(areas.id, places.areaId))
    .where(eq(itineraryItems.itineraryId, itineraryId))
    .orderBy(asc(itineraryItems.dayIndex), asc(itineraryItems.position));
}

type StopRow = Awaited<ReturnType<typeof loadStopRows>>[number];

function toCheckStop(row: StopRow): CheckStop {
  return {
    dayIndex: row.dayIndex,
    activity:
      row.activityId === null
        ? null
        : {
            isActive: row.activityIsActive ?? false,
            durationMin: row.activityDurationMin ?? 0,
            seasonMonths: row.activitySeasonMonths ?? [],
            onSitePriceEur: row.activityOnSitePriceEur === null ? null : Number(row.activityOnSitePriceEur),
            requiresCar: row.activityRequiresCar ?? false,
            title: row.activityTitle ?? "",
          },
    placeAreaId: row.placeAreaId,
  };
}

// Stato completo di un itinerario per i controlli: riga, tappe e copertina risolta
// (propria → luogo della prima tappa → area di quel luogo; il primo media usabile vince).
async function loadTemplateState(tx: AdminTx, itineraryId: string) {
  const template = await loadTemplateRow(tx, itineraryId);
  if (!template) return null;
  const stops = await loadStopRows(tx, itineraryId);
  const firstPlaceId = stops[0]?.placeId ?? null;
  const [covers] = await tx
    .select({
      own: usableCoverJson(itineraries.coverMediaId),
      firstStop: usableCoverJson(sql`(select p.cover_media_id from public.places p where p.id = ${firstPlaceId})`),
      firstArea: areaUsableCoverJson(sql`(select p.area_id from public.places p where p.id = ${firstPlaceId})`),
    })
    .from(itineraries)
    .where(eq(itineraries.id, itineraryId));
  const cover = [covers?.own ?? null, covers?.firstStop ?? null, covers?.firstArea ?? null].find((c) => c !== null) ?? null;
  return { template, stops, cover };
}

type TemplateState = NonNullable<Awaited<ReturnType<typeof loadTemplateState>>>;

function publishInputOf(state: TemplateState, dailyHours: Record<Pace, number>) {
  return {
    days: state.template.days,
    pace: state.template.pace,
    seasonMonths: state.template.seasonMonths,
    stops: state.stops.map(toCheckStop),
    cover: state.cover,
    dailyHours,
  };
}

// Controlli di pubblicazione di un itinerario, nella transazione data. Lancia se non esiste
// (o non è un template): il chiamante lo tratta come errore.
export async function templateChecks(
  tx: AdminTx,
  itineraryId: string,
  dailyHours: Record<Pace, number>,
): Promise<PublishCheck[]> {
  const state = await loadTemplateState(tx, itineraryId);
  if (!state) throw new Error("template_not_found");
  return publishChecks(publishInputOf(state, dailyHours));
}

// Un itinerario già online che non passa più i controlli esce dalle pagine pubbliche: lo slug si toglie
// nella stessa transazione della modifica che lo ha rotto. Senza slug non c'è nulla da togliere.
export async function unpublishIfChecksFail(
  tx: AdminTx,
  itineraryId: string,
  dailyHours: Record<Pace, number>,
): Promise<void> {
  const [row] = await tx
    .select({ slug: itineraries.slug })
    .from(itineraries)
    .where(and(eq(itineraries.id, itineraryId), eq(itineraries.isTemplate, true)));
  if (!row || row.slug === null) return;
  const checks = await templateChecks(tx, itineraryId, dailyHours);
  if (checks.every((check) => check.ok)) return;
  await tx.update(itineraries).set({ slug: null }).where(eq(itineraries.id, itineraryId));
}

// Tutto ciò che l'editor admin mostra di un itinerario pronto, con i controlli e i fatti
// calcolati dal server (mai salvati). Null se non è un template.
export async function readTemplateForAdmin(tx: AdminTx, itineraryId: string, dailyHours: Record<Pace, number>) {
  const state = await loadTemplateState(tx, itineraryId);
  if (!state) return null;
  const nights = await tx
    .select({ nightIndex: itineraryNights.nightIndex, areaId: itineraryNights.areaId, placeId: itineraryNights.placeId })
    .from(itineraryNights)
    .where(eq(itineraryNights.itineraryId, itineraryId))
    .orderBy(asc(itineraryNights.nightIndex));

  const publishInput = publishInputOf(state, dailyHours);
  const checks = publishChecks(publishInput);
  const facts = templateFacts({ days: publishInput.days, stops: publishInput.stops });

  // Nomi delle aree toccate, nell'ordine dei fatti (per l'interfaccia).
  const areaNames = new Map<string, { id: string; nameIt: string; nameEn: string }>();
  for (const row of state.stops) {
    if (row.placeAreaId && row.areaNameIt && !areaNames.has(row.placeAreaId)) {
      areaNames.set(row.placeAreaId, { id: row.placeAreaId, nameIt: row.areaNameIt, nameEn: row.areaNameEn ?? row.areaNameIt });
    }
  }

  return {
    ...state.template,
    items: state.stops.map((row) => ({
      id: row.id,
      dayIndex: row.dayIndex,
      position: row.position,
      timeSlot: row.timeSlot,
      startTime: row.startTime,
      notes: row.notes,
      customTitle: row.customTitle,
      activityId: row.activityId,
      activityTitle: row.activityTitle,
      activityIsActive: row.activityIsActive,
      placeId: row.placeId,
      placeName: row.placeName,
      placeAreaId: row.placeAreaId,
    })),
    nights,
    checks,
    facts: {
      budgetPerDayEur: facts.budgetPerDayEur,
      requiresCar: facts.requiresCar,
      areas: facts.areaIds.flatMap((id) => {
        const area = areaNames.get(id);
        return area ? [area] : [];
      }),
    },
  };
}
