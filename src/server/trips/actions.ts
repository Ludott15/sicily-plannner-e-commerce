"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { routing } from "@/lib/i18n/routing";
import { PACES, TIME_SLOTS } from "@/lib/itinerary-checks";
import { MAX_TRIP_DAYS } from "@/lib/trip-days";
import { moveInDay } from "@/lib/trips";
import { getUser, requireUser } from "@/server/auth";
import { groups, itineraries, itineraryItems } from "@/server/db/schema";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";
import { areaNames, driveTimesBySlug, engineCatalog, getSavedPreferences, toProfile } from "@/server/personalization/data";
import { proposeTrips } from "@/server/personalization/engine";
import { createClient } from "@/server/supabase/server";
import { proposalErrorCodeOf, type ProposalErrorCode, type ProposalFormState } from "@/server/groups/proposal-state";
import { proposeStopTx } from "@/server/groups/proposals";
import {
  addDayTx,
  createShareLinkTx,
  dayStopIds,
  deleteTripTx,
  duplicateTripTx,
  moveStopTx,
  removeDayTx,
  reorderTripTx,
  revokeShareLinkTx,
  saveDayNoteTx,
  saveStopNoteTx,
  updateTripSettingsTx,
  writePlacements,
  type BuilderErrorCode,
  type BuilderResult,
  type Placement,
} from "./builder";
import { activityTitleTx, logItineraryChanges, stopSnapshotTx, tripStopsTx } from "./changes";

// Builder (M5): Zod → utente (o nuova sessione ospite, protetta da Turnstile, per chi parte da
// un itinerario pronto senza account) → scrittura con dbAsUser. La RLS è la seconda difesa:
// un utente non modifica gli itinerari degli altri (can_edit_itinerary).

export type TripActionError = {
  status: "error";
  code: BuilderErrorCode | "captcha_failed" | "failed" | ProposalErrorCode;
};

export type TripFormState = TripActionError | { status: "ok" };

export type ShareLinkState = TripActionError | { status: "created"; url: string };

const localeSchema = z.enum(routing.locales);
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120);
// Un'area (slug) o la coppia di due aree vicine (pairKey: due slug uniti da "+").
const areaKey = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*(\+[a-z0-9]+(-[a-z0-9]+)*)?$/).max(241);
const uuid = z.uuid();

// I campi dei FormData arrivano come stringhe: un campo mancante vale "".
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const dayIndexField = z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().max(MAX_TRIP_DAYS - 1));
const positionField = z.string().regex(/^\d{1,3}$/).transform(Number);

const startSchema = z.object({
  locale: localeSchema,
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("template"), slug }),
    // Una delle proposte di "Ecco tre viaggi": il server la ricalcola, non si fida del client.
    z.object({ kind: z.literal("proposal"), area: areaKey, variant: z.string().regex(/^[a-z_]{1,40}$/).nullable() }),
  ]),
  startDate: z.iso.date().nullable(),
  travelers: z.number().int().min(1).max(30).nullable(),
  captchaToken: z.string().min(1).max(4096).optional(),
});
export type StartTripInput = Omit<z.input<typeof startSchema>, "locale"> & { locale: string };

async function sessionUser(captchaToken: string | undefined): Promise<User | TripActionError> {
  const user = await getUser();
  if (user) return user;
  if (!captchaToken) return { status: "error", code: "captcha_failed" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInAnonymously({ options: { captchaToken } });
  if (error || !data.user) return { status: "error", code: error?.code === "captcha_failed" ? "captcha_failed" : "failed" };
  return data.user;
}

// Array di testo come parametri (mai un letterale costruito a mano).
const textArray = (values: string[]) =>
  values.length === 0 ? sql`'{}'::text[]` : sql`array[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::text[]`;

type NewItem = {
  dayIndex: number;
  position: number;
  activityId: string | null;
  placeId: string | null;
  customTitle: string | null;
  startTime: string | null;
  timeSlot: (typeof TIME_SLOTS)[number] | null;
  notes: string | null;
};

type NewTrip = {
  title: string;
  days: number;
  dayTitles: string[];
  templateId: string | null;
  startDate: string | null;
  travelers: number | null;
  pace: (typeof PACES)[number];
};

async function insertTrip(tx: UserTx, userId: string, trip: NewTrip, items: NewItem[]): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into public.itineraries (owner_id, title, template_id, start_date, days, day_titles, travelers, pace)
    values (${userId}, ${trip.title}, ${trip.templateId}, ${trip.startDate}, ${trip.days},
      ${textArray(trip.dayTitles)}, ${trip.travelers}, ${trip.pace}::trip_pace)
    returning id`);
  const id = row!.id;
  // SQL esplicito: authenticated ha il grant di insert solo su queste colonne, e l'insert di
  // Drizzle le elencherebbe tutte (anche created_at con default), venendo rifiutato.
  if (items.length > 0) {
    const rows = sql.join(
      items.map(
        (item) => sql`(${id}::uuid, ${item.dayIndex}::smallint, ${item.position}::smallint, ${item.activityId}::uuid,
          ${item.placeId}::uuid, ${item.customTitle}, ${item.startTime}::time, ${item.timeSlot}::time_slot, ${item.notes})`,
      ),
      sql`, `,
    );
    await tx.execute(sql`
      insert into public.itinerary_items (itinerary_id, day_index, position, activity_id, place_id, custom_title, start_time, time_slot, notes)
      values ${rows}`);
  }
  return id;
}

// "Usa questo itinerario" e "Salva questo viaggio": crea un itinerario dell'utente (anche
// ospite) con date e persone scelte in quel momento. Da un itinerario pronto eredita i titoli
// dei giorni e il ritmo (o quello del profilo, se il template non ce l'ha); da una proposta,
// il ritmo del profilo. I giorni senza titolo mostrano i luoghi delle tappe.
export async function startTrip(input: StartTripInput): Promise<TripActionError> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { locale, source, startDate, travelers, captchaToken } = parsed.data;

  const user = await sessionUser(source.kind === "template" ? captchaToken : undefined);
  if ("status" in user) return user;

  let id: string;
  try {
    const saved = await getSavedPreferences(user);
    const profilePace = saved?.pace ?? "balanced";
    if (source.kind === "template") {
      const created = await dbAsUser(user, async (tx) => {
        const [template] = await tx
          .select({
            id: itineraries.id,
            title: itineraries.title,
            days: itineraries.days,
            dayTitles: itineraries.dayTitles,
            pace: itineraries.pace,
          })
          .from(itineraries)
          .where(and(eq(itineraries.slug, source.slug), eq(itineraries.isTemplate, true)));
        if (!template) return null;
        const items = await tx
          .select({
            dayIndex: itineraryItems.dayIndex,
            position: itineraryItems.position,
            activityId: itineraryItems.activityId,
            placeId: itineraryItems.placeId,
            customTitle: itineraryItems.customTitle,
            startTime: itineraryItems.startTime,
            timeSlot: itineraryItems.timeSlot,
            notes: itineraryItems.notes,
          })
          .from(itineraryItems)
          .where(eq(itineraryItems.itineraryId, template.id))
          .orderBy(asc(itineraryItems.dayIndex), asc(itineraryItems.position));
        return insertTrip(
          tx,
          user.id,
          {
            title: template.title,
            days: template.days,
            dayTitles: template.dayTitles,
            templateId: template.id,
            startDate,
            travelers,
            pace: template.pace ?? profilePace,
          },
          items,
        );
      });
      if (!created) return { status: "error", code: "not_found" };
      id = created;
    } else {
      if (!saved?.completed) return { status: "error", code: "not_found" };
      const [catalog, names, t, driveTimes] = await Promise.all([
        engineCatalog(),
        areaNames(locale),
        getTranslations({ locale, namespace: "Trips" }),
        driveTimesBySlug(),
      ]);
      const { proposals } = proposeTrips(catalog, toProfile(saved), driveTimes);
      const proposal = proposals.find((p) => p.area === source.area && p.variant === source.variant);
      if (!proposal) return { status: "error", code: "not_found" };
      const items: NewItem[] = proposal.days.flatMap((day, d) =>
        day.activities.map((a, i) => ({
          dayIndex: d,
          position: i,
          activityId: a.id,
          placeId: null,
          customTitle: null,
          startTime: null,
          timeSlot: null,
          notes: null,
        })),
      );
      const nameOf = (slug: string) => names.get(slug) ?? slug;
      const [firstArea, secondArea] = proposal.areas;
      const title =
        secondArea === undefined
          ? t("proposalTripTitle", { area: nameOf(firstArea), days: proposal.days.length })
          : t("proposalTripTitlePair", { first: nameOf(firstArea), second: nameOf(secondArea), days: proposal.days.length });
      id = await dbAsUser(user, (tx) =>
        insertTrip(
          tx,
          user.id,
          { title, days: proposal.days.length, dayTitles: [], templateId: null, startDate, travelers, pace: profilePace },
          items,
        ),
      );
    }
  } catch {
    return { status: "error", code: "failed" };
  }
  revalidatePath("/", "layout");
  redirect(`/${locale}/viaggi/${id}`);
}

const stopSchema = z.object({ itineraryId: z.uuid(), itemId: z.uuid() });

async function recordEvent(tx: UserTx, userId: string, type: "add_to_itinerary" | "remove_from_itinerary", activityId: string, itineraryId: string) {
  // user_events: solo scrittura dal client (il cron della M11 li elabora).
  await tx.execute(sql`
    insert into public.user_events (user_id, type, activity_id, itinerary_id)
    values (${userId}, ${type}, ${activityId}, ${itineraryId})`);
}

// Riscrive le posizioni di una giornata nell'ordine dato (0, 1, 2…).
async function writeOrder(tx: UserTx, itineraryId: string, dayIndex: number, ids: string[]) {
  await writePlacements(
    tx,
    itineraryId,
    ids.map((id, position) => ({ id, dayIndex, position })),
  );
}

export async function removeStop(input: z.input<typeof stopSchema>): Promise<TripActionError | { status: "ok" }> {
  const parsed = stopSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { itineraryId, itemId } = parsed.data;
  try {
    const found = await dbAsUser(user, async (tx) => {
      const snapshot = await stopSnapshotTx(tx, itemId);
      if (!snapshot || snapshot.itineraryId !== itineraryId) return false;
      const [item] = await tx
        .delete(itineraryItems)
        .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.itineraryId, itineraryId)))
        .returning({ dayIndex: itineraryItems.dayIndex, activityId: itineraryItems.activityId });
      if (!item) return false;
      await writeOrder(tx, itineraryId, item.dayIndex, await dayStopIds(tx, itineraryId, item.dayIndex));
      if (item.activityId) await recordEvent(tx, user.id, "remove_from_itinerary", item.activityId, itineraryId);
      await logItineraryChanges(tx, {
        itineraryId,
        actorId: user.id,
        changes: [{ kind: "stop_removed", payload: { title: snapshot.title, day: item.dayIndex + 1 } }],
      });
      return true;
    });
    if (!found) return { status: "error", code: "not_found" };
  } catch {
    return { status: "error", code: "failed" };
  }
  revalidatePath("/", "layout");
  return { status: "ok" };
}

const moveSchema = stopSchema.extend({ direction: z.enum(["up", "down"]) });

export async function moveStop(input: z.input<typeof moveSchema>): Promise<TripActionError | { status: "ok" }> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { itineraryId, itemId, direction } = parsed.data;
  try {
    const found = await dbAsUser(user, async (tx) => {
      const [item] = await tx
        .select({ dayIndex: itineraryItems.dayIndex })
        .from(itineraryItems)
        .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.itineraryId, itineraryId)));
      if (!item) return false;
      await writeOrder(tx, itineraryId, item.dayIndex, moveInDay(await dayStopIds(tx, itineraryId, item.dayIndex), itemId, direction));
      return true;
    });
    if (!found) return { status: "error", code: "not_found" };
  } catch {
    return { status: "error", code: "failed" };
  }
  revalidatePath("/", "layout");
  return { status: "ok" };
}

const addSchema = z.object({ locale: localeSchema, itineraryId: z.uuid(), activityId: z.uuid(), dayIndex: z.number().int().min(0).max(59) });

// "Aggiungi al viaggio" dalla scheda attività: in fondo al giorno scelto. Se il viaggio è di un gruppo
// e chi aggiunge non ne è il proprietario, l'aggiunta diventa una proposta (proposeStopTx) e l'esito
// è { status: "proposed" }: niente redirect, il frontend mostra la conferma della proposta.
type AddOutcome = { kind: "added" } | { kind: "proposed"; state: ProposalFormState } | { kind: "missing" };

export async function addToTrip(
  input: Omit<z.input<typeof addSchema>, "locale"> & { locale: string },
): Promise<TripActionError | { status: "proposed" }> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { locale, itineraryId, activityId, dayIndex } = parsed.data;
  let outcome: AddOutcome;
  try {
    outcome = await dbAsUser(user, async (tx): Promise<AddOutcome> => {
      const [trip] = await tx
        .select({ days: itineraries.days, groupId: itineraries.groupId })
        .from(itineraries)
        .where(eq(itineraries.id, itineraryId));
      if (!trip || dayIndex >= trip.days) return { kind: "missing" };

      if (trip.groupId !== null) {
        const [group] = await tx
          .select({ ownerId: groups.ownerId })
          .from(groups)
          .where(eq(groups.id, trip.groupId));
        if (group && group.ownerId !== user.id) {
          return { kind: "proposed", state: await proposeStopTx(tx, user, { itineraryId, activityId, dayIndex }) };
        }
      }

      const position = (await dayStopIds(tx, itineraryId, dayIndex)).length;
      await tx.execute(sql`
        insert into public.itinerary_items (itinerary_id, day_index, position, activity_id)
        values (${itineraryId}, ${dayIndex}, ${position}, ${activityId})`);
      await recordEvent(tx, user.id, "add_to_itinerary", activityId, itineraryId);
      const title = await activityTitleTx(tx, activityId);
      await logItineraryChanges(tx, {
        itineraryId,
        actorId: user.id,
        changes: [{ kind: "stop_added", payload: { title, day: dayIndex + 1 } }],
      });
      return { kind: "added" };
    });
  } catch (error) {
    return { status: "error", code: proposalErrorCodeOf(error) };
  }

  if (outcome.kind === "missing") return { status: "error", code: "not_found" };
  if (outcome.kind === "proposed") {
    if (outcome.state.status === "error") return { status: "error", code: outcome.state.code };
    revalidatePath("/", "layout");
    return { status: "proposed" };
  }
  revalidatePath("/", "layout");
  redirect(`/${locale}/viaggi/${itineraryId}?giorno=${dayIndex + 1}`);
}

const bookingSchema = z.object({
  itineraryId: z.uuid(),
  kind: z.enum(["activity", "lodging", "car", "flight"]),
  activityId: z.uuid().nullable(),
  done: z.boolean(),
});

// Checklist "Da prenotare": lo stato lo segna l'utente (non riceviamo conferme dai partner).
export async function setBookingDone(input: z.input<typeof bookingSchema>): Promise<TripActionError | { status: "ok" }> {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success || (parsed.data.kind === "activity") !== (parsed.data.activityId !== null)) {
    return { status: "error", code: "invalid" };
  }
  const user = await requireUser();
  const { itineraryId, kind, activityId, done } = parsed.data;
  const status = done ? "booked" : "to_book";
  try {
    await dbAsUser(user, (tx) =>
      tx.execute(sql`
        insert into public.itinerary_bookings (itinerary_id, kind, activity_id, status)
        values (${itineraryId}, ${kind}, ${activityId}, ${status})
        on conflict on constraint itinerary_bookings_item_unique do update set status = excluded.status`),
    );
  } catch {
    return { status: "error", code: "failed" };
  }
  revalidatePath("/", "layout");
  return { status: "ok" };
}

// ---------------------------------------------------------------------------------------------
// Builder (1.4): tappe, giorni, impostazioni, note, duplica, elimina, link pubblico.
// Ogni azione: Zod → requireUser → dbAsUser (una transazione). Un errore di scrittura nella
// transazione la annulla e l'azione risponde "failed".
// ---------------------------------------------------------------------------------------------

const tripIdForm = z.object({ tripId: uuid });

// Esito di una funzione del builder come stato del form. Un errore nella transazione
// (RLS, vincoli) diventa "failed".
async function runWrite(user: DbUser, write: (tx: UserTx) => Promise<BuilderResult>): Promise<TripFormState> {
  let result: BuilderResult;
  try {
    result = await dbAsUser(user, write);
  } catch {
    return { status: "error", code: "failed" };
  }
  if (!result.ok) return { status: "error", code: result.code };
  revalidatePath("/", "layout");
  return { status: "ok" };
}

// Ordine di tutte le tappe: JSON [{ id, dayIndex, position }]. Tutte le tappe, una volta sola.
const orderItemSchema = z.object({
  id: uuid,
  dayIndex: z.number().int().min(0).max(MAX_TRIP_DAYS - 1),
  position: z.number().int().min(0).max(999),
});

export async function moveStopTo(formData: FormData): Promise<TripFormState> {
  const parsed = z
    .object({ stopId: uuid, dayIndex: dayIndexField, position: positionField.pipe(z.number().int().max(999)) })
    .safeParse({ stopId: field(formData, "stopId"), dayIndex: field(formData, "dayIndex"), position: field(formData, "position") });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { stopId, dayIndex, position } = parsed.data;
  return runWrite(user, async (tx): Promise<BuilderResult> => {
    const before = await stopSnapshotTx(tx, stopId);
    if (!before) return { ok: false, code: "not_found" };
    const result = await moveStopTx(tx, stopId, dayIndex, position);
    if (result.ok && before.dayIndex !== dayIndex) {
      await logItineraryChanges(tx, {
        itineraryId: before.itineraryId,
        actorId: user.id,
        changes: [{ kind: "stop_moved", payload: { title: before.title, day: dayIndex + 1 } }],
      });
    }
    return result;
  });
}

export async function reorderTrip(formData: FormData): Promise<TripFormState> {
  const ids = tripIdForm.safeParse({ tripId: field(formData, "tripId") });
  if (!ids.success) return { status: "error", code: "invalid" };
  let raw: unknown;
  try {
    raw = JSON.parse(field(formData, "order"));
  } catch {
    return { status: "error", code: "invalid" };
  }
  const order = z.array(orderItemSchema).max(1000).safeParse(raw);
  if (!order.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const rows: Placement[] = order.data;
  const tripId = ids.data.tripId;
  return runWrite(user, async (tx): Promise<BuilderResult> => {
    const before = await tripStopsTx(tx, tripId);
    const result = await reorderTripTx(tx, tripId, rows);
    if (!result.ok) return result;
    const previous = new Map(before.map((stop) => [stop.id, stop]));
    const changes = rows.flatMap((row) => {
      const prev = previous.get(row.id);
      return prev && prev.dayIndex !== row.dayIndex
        ? [{ kind: "stop_moved" as const, payload: { title: prev.title, day: row.dayIndex + 1 } }]
        : [];
    });
    await logItineraryChanges(tx, { itineraryId: tripId, actorId: user.id, changes });
    return result;
  });
}

export async function addDay(formData: FormData): Promise<TripFormState> {
  const parsed = tripIdForm.safeParse({ tripId: field(formData, "tripId") });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const tripId = parsed.data.tripId;
  return runWrite(user, async (tx): Promise<BuilderResult> => {
    const [before] = await tx.select({ days: itineraries.days }).from(itineraries).where(eq(itineraries.id, tripId));
    const result = await addDayTx(tx, tripId);
    if (result.ok && before) {
      await logItineraryChanges(tx, {
        itineraryId: tripId,
        actorId: user.id,
        changes: [{ kind: "day_added", payload: { day: before.days + 1 } }],
      });
    }
    return result;
  });
}

export async function removeDay(formData: FormData): Promise<TripFormState> {
  const parsed = z
    .object({ tripId: uuid, dayIndex: dayIndexField })
    .safeParse({ tripId: field(formData, "tripId"), dayIndex: field(formData, "dayIndex") });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { tripId, dayIndex } = parsed.data;
  return runWrite(user, async (tx): Promise<BuilderResult> => {
    const result = await removeDayTx(tx, tripId, dayIndex);
    if (result.ok) {
      await logItineraryChanges(tx, {
        itineraryId: tripId,
        actorId: user.id,
        changes: [{ kind: "day_removed", payload: { day: dayIndex + 1 } }],
      });
    }
    return result;
  });
}

const settingsSchema = z.object({
  tripId: uuid,
  title: z.string().trim().min(1).max(200),
  startDate: z.union([z.literal(""), z.iso.date()]),
  travelers: z.union([z.literal(""), z.string().regex(/^\d{1,2}$/).refine((v) => Number(v) >= 1 && Number(v) <= 30)]),
  pace: z.union([z.literal(""), z.enum(PACES)]),
});

export async function updateTripSettings(_prev: TripFormState, formData: FormData): Promise<TripFormState> {
  const parsed = settingsSchema.safeParse({
    tripId: field(formData, "tripId"),
    title: field(formData, "title"),
    startDate: field(formData, "startDate"),
    travelers: field(formData, "travelers"),
    pace: field(formData, "pace"),
  });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { tripId, title, startDate, travelers, pace } = parsed.data;
  return runWrite(user, (tx) =>
    updateTripSettingsTx(tx, tripId, {
      title,
      startDate: startDate === "" ? null : startDate,
      travelers: travelers === "" ? null : Number(travelers),
      pace: pace === "" ? null : pace,
    }),
  );
}

export async function saveDayNote(_prev: TripFormState, formData: FormData): Promise<TripFormState> {
  const parsed = z
    .object({ tripId: uuid, dayIndex: dayIndexField, note: z.string().trim().max(500) })
    .safeParse({ tripId: field(formData, "tripId"), dayIndex: field(formData, "dayIndex"), note: field(formData, "note") });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { tripId, dayIndex, note } = parsed.data;
  return runWrite(user, (tx) => saveDayNoteTx(tx, tripId, dayIndex, note));
}

export async function saveStopNote(_prev: TripFormState, formData: FormData): Promise<TripFormState> {
  const parsed = z
    .object({
      stopId: uuid,
      note: z.string().trim().max(280),
      timeSlot: z.union([z.literal(""), z.enum(TIME_SLOTS)]),
    })
    .safeParse({ stopId: field(formData, "stopId"), note: field(formData, "note"), timeSlot: field(formData, "timeSlot") });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { stopId, note, timeSlot } = parsed.data;
  return runWrite(user, (tx) => saveStopNoteTx(tx, stopId, note === "" ? null : note, timeSlot === "" ? null : timeSlot));
}

const copyForm = z.object({ locale: localeSchema, tripId: uuid });

// Duplica il viaggio e va alla copia. Il prefisso del titolo viene dalla lingua della pagina.
export async function duplicateTrip(formData: FormData): Promise<TripFormState> {
  const parsed = copyForm.safeParse({ locale: field(formData, "locale"), tripId: field(formData, "tripId") });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { locale, tripId } = parsed.data;
  const t = await getTranslations({ locale, namespace: "Trips" });
  let id: string | null;
  try {
    id = await dbAsUser(user, (tx) => duplicateTripTx(tx, user, tripId, t("copyPrefix")));
  } catch {
    return { status: "error", code: "failed" };
  }
  if (!id) return { status: "error", code: "not_found" };
  revalidatePath("/", "layout");
  redirect(`/${locale}/viaggi/${id}`);
}

// Elimina il viaggio (le tappe e le notti vanno via per cascade) e torna all'elenco.
export async function deleteTrip(formData: FormData): Promise<TripFormState> {
  const parsed = copyForm.safeParse({ locale: field(formData, "locale"), tripId: field(formData, "tripId") });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { locale, tripId } = parsed.data;
  const result = await runWrite(user, (tx) => deleteTripTx(tx, tripId));
  if (result.status !== "ok") return result;
  redirect(`/${locale}/viaggi`);
}

// Crea il link pubblico: il token in chiaro torna una volta sola, nell'URL. Il link precedente
// (se c'era) viene revocato.
export async function createShareLink(_prev: ShareLinkState, formData: FormData): Promise<ShareLinkState> {
  const parsed = copyForm.safeParse({ locale: field(formData, "locale"), tripId: field(formData, "tripId") });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { locale, tripId } = parsed.data;
  let result: BuilderResult<string>;
  try {
    result = await dbAsUser(user, (tx) => createShareLinkTx(tx, user, tripId));
  } catch {
    return { status: "error", code: "failed" };
  }
  if (!result.ok) return { status: "error", code: result.code };
  revalidatePath("/", "layout");
  return { status: "created", url: new URL(`/${locale}/v/${result.value}`, publicEnv.NEXT_PUBLIC_SITE_URL).toString() };
}

export async function revokeShareLink(formData: FormData): Promise<TripFormState> {
  const parsed = tripIdForm.safeParse({ tripId: field(formData, "tripId") });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  return runWrite(user, (tx) => revokeShareLinkTx(tx, parsed.data.tripId));
}
