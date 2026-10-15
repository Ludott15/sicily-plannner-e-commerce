"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AdminErrorCode, AdminFormState } from "@/lib/admin-form";
import { PACES, TIME_SLOTS, TRAVEL_PARTIES, isTravelParty, type TravelParty } from "@/lib/itinerary-checks";
import { routing } from "@/lib/i18n/routing";
import { PROVINCES } from "@/lib/provinces";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import {
  activities,
  activityInterests,
  activityOffers,
  activitySources,
  adminAuditLog,
  itineraries,
  itineraryItems,
  itineraryNights,
  places,
} from "@/server/db/schema";
import { DAILY_HOURS } from "@/server/personalization/config";
import { templateChecks, unpublishIfChecksFail, type AdminTx } from "./templates.admin";

// Azioni dell'admin del catalogo: Zod → requireAdmin → scrittura con dbAdmin in transazione.
// Ogni cambio di stato di un'attività (attivazione, disattivazione) aggiunge una riga
// ad admin_audit_log. La regola "niente attivazione senza tag" la controlla anche il
// database (trigger activities_require_tags): qui si dà un messaggio chiaro prima.


const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));
const optionalNumber = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
  .pipe(z.number().nonnegative().nullable());
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on");
// Testo facoltativo con limite di lunghezza: vuoto = null.
const optionalTextMax = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));
// Link alla fonte: solo http o https, vuoto = null.
const optionalSourceUrl = optionalTextMax(2000).pipe(z.url({ protocol: /^https?$/ }).max(2000).nullable());

// Scelta singola facoltativa (select del form): vuota o assente = null.
function optionalEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .enum(values)
    .or(z.literal(""))
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v));
}

function dbErrorCode(error: unknown): AdminErrorCode {
  const cause = (error as { cause?: { code?: string; message?: string; constraint_name?: string } })?.cause ?? error;
  const { code, message, constraint_name: constraint } = cause as {
    code?: string;
    message?: string;
    constraint_name?: string;
  };
  if (message === "activity_without_tags") return "activity_without_tags";
  if (message === "activity_place_inactive") return "activity_place_inactive";
  if (message === "place_has_active_activities") return "place_has_active_activities";
  if (message === "template_days_below_stops") return "template_days_below_stops";
  // Due luoghi con l'hero nella stessa transazione: il vincolo non si può violare senza concorrenza.
  if (code === "23505" && constraint === "places_single_home_hero") return "failed";
  if (code === "23505") return constraint?.includes("partner_product") ? "partner_product_taken" : "slug_taken";
  if (code === "23514" && constraint?.includes("day_titles")) return "day_titles_exceed_days";
  return "failed";
}

// ---------------------------------------------------------------------------
// Attività
// ---------------------------------------------------------------------------

const activitySchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  locale: localeSchema,
  title: z.string().trim().min(3).max(200),
  slug: slugSchema,
  placeId: z.uuid(),
  description: optionalText,
  durationMin: z.coerce.number().int().positive().max(24 * 60),
  onSitePriceEur: optionalNumber,
  requiresCar: checkbox,
  accessible: checkbox,
  rating: optionalNumber.pipe(z.number().max(5).nullable()),
  isActive: checkbox,
  // Import e dati interni: il titolo inglese è solo memorizzato, la fonte e le note non sono mai pubbliche.
  titleEn: optionalTextMax(200),
  needsReview: checkbox,
  sourceUrl: optionalSourceUrl,
  notes: optionalTextMax(2000),
});

function readActivityForm(formData: FormData) {
  const months = formData.getAll("seasonMonths").map(Number);
  const diets = new Set(["vegetarian", "vegan", "gluten_free", "lactose_free"]);
  const dietFriendly = [...new Set(formData.getAll("dietFriendly").map(String))].filter((d) => diets.has(d)).sort();
  const tags = [...formData.entries()]
    .filter(([key]) => key.startsWith("tag_"))
    .map(([key, value]) => ({ key: key.slice(4), strength: Number(value) }))
    .filter((t) => t.strength >= 1 && t.strength <= 3);
  return { months, tags, dietFriendly };
}

export async function saveActivity(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = activitySchema.safeParse(Object.fromEntries(formData));
  const { months, tags, dietFriendly } = readActivityForm(formData);
  if (!parsed.success || months.some((m) => !Number.isInteger(m) || m < 1 || m > 12) || months.length === 0) {
    return { status: "error", code: "invalid" };
  }
  const { user } = await requireAdmin();
  const { id, locale, isActive, sourceUrl, notes, ...fields } = parsed.data;
  if (isActive && tags.length === 0) return { status: "error", code: "activity_without_tags" };

  let savedId: string;
  try {
    savedId = await dbAdmin.transaction(async (tx) => {
      const values = {
        ...fields,
        onSitePriceEur: fields.onSitePriceEur === null ? null : fields.onSitePriceEur.toFixed(2),
        rating: fields.rating === null ? null : fields.rating.toFixed(1),
        seasonMonths: [...new Set(months)].sort((a, b) => a - b),
        dietFriendly,
        isActive,
      };
      let previous: boolean | null = null;
      let activityId: string;
      if (id) {
        const [row] = await tx.select({ isActive: activities.isActive }).from(activities).where(eq(activities.id, id));
        if (!row) throw new Error("not_found");
        previous = row.isActive;
        await tx.update(activities).set(values).where(eq(activities.id, id));
        activityId = id;
      } else {
        const [row] = await tx.insert(activities).values(values).returning({ id: activities.id });
        activityId = row!.id;
      }

      await tx.delete(activityInterests).where(eq(activityInterests.activityId, activityId));
      if (tags.length > 0) {
        await tx
          .insert(activityInterests)
          .values(tags.map((t) => ({ activityId, interestKey: t.key, strength: t.strength })));
      }

      // Fonte e note stanno in una tabella a parte, solo admin: se entrambe sono vuote la riga non serve più.
      if (sourceUrl || notes) {
        await tx
          .insert(activitySources)
          .values({ activityId, sourceUrl, notes })
          .onConflictDoUpdate({
            target: activitySources.activityId,
            set: { sourceUrl, notes, updatedAt: sql`now()` },
          });
      } else {
        await tx.delete(activitySources).where(eq(activitySources.activityId, activityId));
      }

      if (previous !== isActive && (previous !== null || isActive)) {
        await tx.insert(adminAuditLog).values({
          actorId: user.id,
          action: isActive ? "activity.activate" : "activity.deactivate",
          entity: "activities",
          entityId: activityId,
          diff: { is_active: [previous, isActive], tags: tags.map((t) => t.key) },
        });
      }
      return activityId;
    });
  } catch (error) {
    return { status: "error", code: dbErrorCode(error) };
  }
  redirect(`/${locale}/admin/attivita/${savedId}?salvata=1`);
}

// ---------------------------------------------------------------------------
// Luoghi
// ---------------------------------------------------------------------------

// Ordine nel carosello (1..99): vuoto = nessun ordine, in fondo.
const optionalFeaturedOrder = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : null))
  .pipe(z.number().int().min(1).max(99).nullable());

const placeSchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  locale: localeSchema,
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  province: z.enum(Object.keys(PROVINCES) as [string, ...string[]]),
  // Area di viaggio; vuota = non ancora assegnata.
  areaId: z.uuid().nullable().or(z.literal("").transform(() => null)),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  description: optionalText,
  // Didascalia breve per le schede pubbliche (il form la limita a 90 caratteri).
  taglineIt: optionalTextMax(90),
  // Un luogo disattivato esce dalle pagine pubbliche; con attività attive il database lo impedisce.
  isActive: checkbox,
  needsReview: checkbox,
  // Carosello della home: vuoto = in fondo, a parità di ordine vale il nome.
  isFeatured: checkbox,
  featuredOrder: optionalFeaturedOrder,
  // is_home_hero non si modifica più dall'admin (l'hero è casuale tra i luoghi in evidenza): il
  // campo non è nello schema, quindi il salvataggio lo lascia com'è.
});

export async function savePlace(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = placeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();
  const { id, locale, ...values } = parsed.data;

  let savedId: string;
  try {
    savedId = await dbAdmin.transaction(async (tx) => {
      if (id) {
        await tx.update(places).set(values).where(eq(places.id, id));
        return id;
      }
      const [row] = await tx.insert(places).values(values).returning({ id: places.id });
      return row!.id;
    });
  } catch (error) {
    return { status: "error", code: dbErrorCode(error) };
  }
  redirect(`/${locale}/admin/luoghi/${savedId}?salvato=1`);
}

// ---------------------------------------------------------------------------
// Itinerari pronti (template editoriali: owner_id null, is_template true)
// ---------------------------------------------------------------------------

const templateSchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  locale: localeSchema,
  title: z.string().trim().min(3).max(200),
  // Vuoto = non pubblicato: gli itinerari pronti compaiono nelle pagine pubbliche solo con uno slug.
  slug: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(slugSchema.nullable()),
  days: z.coerce.number().int().min(1).max(60),
  subtitle: optionalTextMax(140),
  description: optionalTextMax(2000),
  pace: optionalEnum(PACES),
});

const DAY_INTRO_MAX = 280;
const NIGHT_REF = /^(area|place):(.+)$/;

type NightInput = { nightIndex: number; areaId: string | null; placeId: string | null };

// Mesi consigliati: solo interi da 1 a 12, senza ripetizioni. Vuoto = tutto l'anno.
function readSeasonMonths(formData: FormData): number[] | null {
  const months = formData.getAll("seasonMonths").map((value) => Number(value));
  if (months.some((month) => !Number.isInteger(month) || month < 1 || month > 12)) return null;
  return [...new Set(months)].sort((a, b) => a - b);
}

function readSuitableFor(formData: FormData): TravelParty[] | null {
  const values = formData.getAll("suitableFor").map((value) => String(value));
  if (!values.every((value) => isTravelParty(value))) return null;
  return TRAVEL_PARTIES.filter((party) => values.includes(party));
}

// Un'introduzione per giorno, come i titoli: le ultime vuote si tolgono, quelle in mezzo restano "".
function readDayIntros(formData: FormData, days: number): string[] | null {
  const intros = Array.from({ length: days }, (_, i) => String(formData.get(`dayIntro_${i}`) ?? "").trim());
  if (intros.some((intro) => intro.length > DAY_INTRO_MAX)) return null;
  while (intros.length > 0 && intros.at(-1) === "") intros.pop();
  return intros;
}

// Notti 1..days-1 ("area:<uuid>", "place:<uuid>" o vuoto). La notte n sta dopo il giorno n.
function readNights(formData: FormData, days: number): NightInput[] | null {
  const nights: NightInput[] = [];
  for (let nightIndex = 1; nightIndex < days; nightIndex++) {
    const raw = String(formData.get(`night_${nightIndex}`) ?? "").trim();
    if (raw === "") continue;
    const match = NIGHT_REF.exec(raw);
    const id = z.uuid().safeParse(match?.[2]);
    if (!match || !id.success) return null;
    nights.push({
      nightIndex,
      areaId: match[1] === "area" ? id.data : null,
      placeId: match[1] === "place" ? id.data : null,
    });
  }
  return nights;
}

// Le notti si riscrivono per intero: poche righe, una cancellazione e un insert.
async function replaceNights(tx: AdminTx, itineraryId: string, nights: NightInput[]) {
  await tx.delete(itineraryNights).where(eq(itineraryNights.itineraryId, itineraryId));
  if (nights.length > 0) {
    await tx.insert(itineraryNights).values(nights.map((night) => ({ itineraryId, ...night })));
  }
}

// Salvataggio dell'itinerario pronto. Lo slug (pubblicazione) si scrive solo se tutti i controlli
// di pubblicazione passano: altrimenti non è pubblicato (anche se lo era) e la risposta è template_checks_failed.
// Un template nuovo nasce sempre in bozza: se lo si voleva pubblicare, si va alla pagina di modifica.
export async function saveTemplate(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { id, locale, slug, ...fields } = parsed.data;
  const seasonMonths = readSeasonMonths(formData);
  const suitableFor = readSuitableFor(formData);
  const dayIntros = readDayIntros(formData, fields.days);
  const nights = readNights(formData, fields.days);
  if (!seasonMonths || !suitableFor || !dayIntros || !nights) return { status: "error", code: "invalid" };
  await requireAdmin();

  // Titoli dei giorni: uno per giorno; gli ultimi vuoti si tolgono, quelli in mezzo restano "".
  const dayTitles = Array.from({ length: fields.days }, (_, i) =>
    String(formData.get(`dayTitle_${i}`) ?? "").trim().slice(0, 80),
  );
  while (dayTitles.length > 0 && dayTitles.at(-1) === "") dayTitles.pop();

  const values = {
    title: fields.title,
    days: fields.days,
    subtitle: fields.subtitle,
    description: fields.description,
    pace: fields.pace,
    seasonMonths,
    suitableFor,
    dayIntros,
    dayTitles,
  };

  let saved: { id: string; publishBlocked: boolean };
  try {
    saved = await dbAdmin.transaction(async (tx) => {
      if (id) {
        const [previous] = await tx
          .select({ slug: itineraries.slug })
          .from(itineraries)
          .where(and(eq(itineraries.id, id), eq(itineraries.isTemplate, true)));
        if (!previous) throw new Error("not_found");
        // Meno giorni delle tappe salvate: le tappe oltre l'ultimo giorno sparirebbero dall'editor.
        const [last] = await tx
          .select({ lastDay: sql<number | null>`max(${itineraryItems.dayIndex})` })
          .from(itineraryItems)
          .where(eq(itineraryItems.itineraryId, id));
        const lastDay = last?.lastDay ?? null;
        if (lastDay !== null && lastDay >= values.days) throw new Error("template_days_below_stops");
        // Senza slug la pubblicazione si toglie. Con uno, lo slug si scrive solo se i controlli passano:
        // altrimenti si toglie anche quello già online, così la pagina pubblica sparisce finché non si corregge.
        await tx
          .update(itineraries)
          .set({ ...values, slug: slug === null ? null : previous.slug })
          .where(eq(itineraries.id, id));
        await replaceNights(tx, id, nights);
        if (slug === null) return { id, publishBlocked: false };
        const checks = await templateChecks(tx, id, DAILY_HOURS);
        if (!checks.every((check) => check.ok)) {
          await tx.update(itineraries).set({ slug: null }).where(eq(itineraries.id, id));
          return { id, publishBlocked: true };
        }
        await tx.update(itineraries).set({ slug }).where(eq(itineraries.id, id));
        return { id, publishBlocked: false };
      }
      const [row] = await tx
        .insert(itineraries)
        .values({ ...values, slug: null, ownerId: null, isTemplate: true, status: "planned" })
        .returning({ id: itineraries.id });
      if (!row) throw new Error("insert_failed");
      await replaceNights(tx, row.id, nights);
      return { id: row.id, publishBlocked: slug !== null };
    });
  } catch (error) {
    return { status: "error", code: dbErrorCode(error) };
  }

  if (saved.publishBlocked) {
    if (id) {
      // Modifica: la pagina resta qui e mostra l'elenco dei controlli aggiornato.
      revalidatePath(`/${locale}/admin/itinerari/${saved.id}`);
      return { status: "error", code: "template_checks_failed" };
    }
    redirect(`/${locale}/admin/itinerari/${saved.id}?controlli=1`);
  }
  redirect(`/${locale}/admin/itinerari/${saved.id}?salvato=1`);
}

// Una tappa è un'attività, un luogo o un titolo libero (in quest'ordine di precedenza).
const itemSchema = z.object({
  locale: localeSchema,
  templateId: z.uuid(),
  dayIndex: z.coerce.number().int().min(0).max(59),
  activityId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  placeId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  customTitle: optionalText.optional(),
  timeSlot: optionalEnum(TIME_SLOTS),
  notes: optionalTextMax(280),
});

export async function addTemplateItem(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { locale, templateId, dayIndex, activityId, placeId, customTitle, timeSlot, notes } = parsed.data;
  const subject = activityId
    ? { activityId, placeId: null, customTitle: null }
    : placeId
      ? { activityId: null, placeId, customTitle: null }
      : customTitle
        ? { activityId: null, placeId: null, customTitle }
        : null;
  if (!subject) return { status: "error", code: "invalid" };
  await requireAdmin();

  try {
    await dbAdmin.transaction(async (tx) => {
      // Il giorno deve esistere nel template: una tappa oltre l'ultimo giorno sparirebbe dall'editor.
      const [template] = await tx
        .select({ days: itineraries.days })
        .from(itineraries)
        .where(and(eq(itineraries.id, templateId), eq(itineraries.isTemplate, true)));
      if (!template || dayIndex >= template.days) throw new Error("invalid_item");
      const [{ next }] = (await tx.execute<{ next: number }>(
        sql`select coalesce(max(position) + 1, 0)::int as next from public.itinerary_items where itinerary_id = ${templateId} and day_index = ${dayIndex}`,
      )) as unknown as [{ next: number }];
      await tx.insert(itineraryItems).values({
        itineraryId: templateId,
        dayIndex,
        position: next,
        ...subject,
        timeSlot,
        notes,
      });
      await unpublishIfChecksFail(tx, templateId, DAILY_HOURS);
    });
  } catch (error) {
    const invalid = error instanceof Error && error.message === "invalid_item";
    return { status: "error", code: invalid ? "invalid" : dbErrorCode(error) };
  }
  // Niente redirect: con la sola ancora diversa (#giorno-N) Next non ricaricherebbe i dati.
  revalidatePath(`/${locale}/admin/itinerari/${templateId}`);
  return { status: "saved" };
}

// Ora indicativa e nota di una tappa.
const itemUpdateSchema = z.object({
  locale: localeSchema,
  templateId: z.uuid(),
  itemId: z.uuid(),
  timeSlot: optionalEnum(TIME_SLOTS),
  notes: optionalTextMax(280),
});

export async function updateTemplateItem(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = itemUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();
  const { locale, templateId, itemId, timeSlot, notes } = parsed.data;

  const updated = await dbAdmin
    .update(itineraryItems)
    .set({ timeSlot, notes })
    .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.itineraryId, templateId)))
    .returning({ id: itineraryItems.id });
  if (updated.length === 0) return { status: "error", code: "invalid" };
  revalidatePath(`/${locale}/admin/itinerari/${templateId}`);
  return { status: "saved" };
}

const itemRefSchema = z.object({
  locale: localeSchema,
  templateId: z.uuid(),
  itemId: z.uuid(),
});

export async function deleteTemplateItem(formData: FormData) {
  const parsed = itemRefSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await requireAdmin();
  const { locale, templateId, itemId } = parsed.data;
  await dbAdmin.transaction(async (tx) => {
    await tx
      .delete(itineraryItems)
      .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.itineraryId, templateId)));
    await unpublishIfChecksFail(tx, templateId, DAILY_HOURS);
  });
  redirect(`/${locale}/admin/itinerari/${templateId}`);
}

const reorderSchema = z.object({
  locale: localeSchema,
  templateId: z.uuid(),
  items: z
    .array(
      z.object({
        id: z.uuid(),
        dayIndex: z.number().int().min(0).max(59),
        position: z.number().int().min(0).max(9999),
      }),
    )
    .min(1)
    .max(1000),
});

function parseJsonValue(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

// Ordine di tutte le tappe di un itinerario dopo un trascinamento. "items" è il JSON
// [{ id, dayIndex, position }] con tutte le tappe del template: le posizioni si riscrivono 0..n per giorno.
export async function reorderTemplateItems(formData: FormData): Promise<AdminFormState> {
  const parsed = reorderSchema.safeParse({
    locale: formData.get("locale"),
    templateId: formData.get("templateId"),
    items: parseJsonValue(formData.get("items")),
  });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { locale, templateId, items } = parsed.data;
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) return { status: "error", code: "invalid" };
  await requireAdmin();

  // Per giorno, nell'ordine della posizione indicata (a parità vale l'ordine dell'elenco).
  const byDay = new Map<number, typeof items>();
  for (const item of items) {
    byDay.set(item.dayIndex, [...(byDay.get(item.dayIndex) ?? []), item]);
  }
  const rows = [...byDay.values()].flatMap((day) =>
    [...day]
      .sort((a, b) => a.position - b.position)
      .map((item, position) => ({ id: item.id, dayIndex: item.dayIndex, position })),
  );

  try {
    await dbAdmin.transaction(async (tx) => {
      const [template] = await tx
        .select({ days: itineraries.days })
        .from(itineraries)
        .where(and(eq(itineraries.id, templateId), eq(itineraries.isTemplate, true)));
      const stored = await tx
        .select({ id: itineraryItems.id })
        .from(itineraryItems)
        .where(eq(itineraryItems.itineraryId, templateId));
      const storedIds = new Set(stored.map((row) => row.id));
      const complete = stored.length === items.length && items.every((item) => storedIds.has(item.id));
      if (!template || !complete || items.some((item) => item.dayIndex >= template.days)) {
        throw new Error("reorder_invalid");
      }
      // Una sola UPDATE con tutte le righe, niente query nel ciclo.
      await tx.execute(sql`
        update public.itinerary_items as i
        set day_index = v.day_index, position = v.position
        from (values ${sql.join(
          rows.map((row) => sql`(${row.id}::uuid, ${row.dayIndex}::smallint, ${row.position}::smallint)`),
          sql`, `,
        )}) as v(id, day_index, position)
        where i.id = v.id and i.itinerary_id = ${templateId}::uuid`);
      await unpublishIfChecksFail(tx, templateId, DAILY_HOURS);
    });
  } catch (error) {
    const invalid = error instanceof Error && error.message === "reorder_invalid";
    return { status: "error", code: invalid ? "invalid" : dbErrorCode(error) };
  }
  revalidatePath(`/${locale}/admin/itinerari/${templateId}`);
  return { status: "saved" };
}

// ---------------------------------------------------------------------------
// Offerte dei partner di un'attività (activity_offers)
// ---------------------------------------------------------------------------

const OFFER_PARTNERS = ["getyourguide", "viator", "civitatis", "travelpayouts", "car_rental"] as const;

const offerSchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  activityId: z.uuid(),
  locale: localeSchema,
  partner: z.enum(OFFER_PARTNERS),
  partnerProductId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(3).max(200),
  priceFromEur: optionalNumber,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  affiliateUrl: z.url({ protocol: /^https$/ }).max(2048),
  rating: optionalNumber.pipe(z.number().max(5).nullable()),
  reviewsCount: optionalNumber.pipe(z.number().int().nullable()),
  freeCancellation: z.enum(["", "yes", "no"]).transform((v) => (v === "" ? null : v === "yes")),
  isActive: checkbox,
});

// La data del prezzo cambia solo quando cambia il prezzo: è quella mostrata nell'offerta.
export async function saveOffer(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = offerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { user } = await requireAdmin();
  const { id, activityId, locale, priceFromEur, rating, ...fields } = parsed.data;
  const price = priceFromEur === null ? null : priceFromEur.toFixed(2);

  try {
    await dbAdmin.transaction(async (tx) => {
      const values = { ...fields, activityId, priceFromEur: price, rating: rating === null ? null : rating.toFixed(1) };
      let offerId: string;
      if (id) {
        const [row] = await tx
          .select({ price: activityOffers.priceFromEur })
          .from(activityOffers)
          .where(and(eq(activityOffers.id, id), eq(activityOffers.activityId, activityId)));
        if (!row) throw new Error("not_found");
        await tx
          .update(activityOffers)
          .set({ ...values, ...(row.price !== price && { priceUpdatedAt: price === null ? null : new Date() }) })
          .where(eq(activityOffers.id, id));
        offerId = id;
      } else {
        const [row] = await tx
          .insert(activityOffers)
          .values({ ...values, priceUpdatedAt: price === null ? null : new Date() })
          .returning({ id: activityOffers.id });
        offerId = row!.id;
      }
      await tx.insert(adminAuditLog).values({
        actorId: user.id,
        action: "offer.save",
        entity: "activity_offers",
        entityId: offerId,
        diff: {
          activity_id: activityId,
          partner: fields.partner,
          is_active: fields.isActive,
          price_eur: price,
          created: id === undefined,
        },
      });
    });
  } catch (error) {
    return { status: "error", code: dbErrorCode(error) };
  }
  redirect(`/${locale}/admin/attivita/${activityId}?offerta=salvata#offerte`);
}

const deleteOfferSchema = z.object({ id: z.uuid(), activityId: z.uuid(), locale: localeSchema });

export async function deleteOffer(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = deleteOfferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { user } = await requireAdmin();
  const { id, activityId, locale } = parsed.data;
  await dbAdmin.transaction(async (tx) => {
    const [row] = await tx
      .select({ partner: activityOffers.partner })
      .from(activityOffers)
      .where(and(eq(activityOffers.id, id), eq(activityOffers.activityId, activityId)));
    if (!row) return;
    await tx
      .delete(activityOffers)
      .where(and(eq(activityOffers.id, id), eq(activityOffers.activityId, activityId)));
    await tx.insert(adminAuditLog).values({
      actorId: user.id,
      action: "offer.delete",
      entity: "activity_offers",
      entityId: id,
      diff: { activity_id: activityId, partner: row.partner },
    });
  });
  redirect(`/${locale}/admin/attivita/${activityId}?offerta=eliminata#offerte`);
}
