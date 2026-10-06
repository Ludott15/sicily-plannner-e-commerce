"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { routing } from "@/lib/i18n/routing";
import { moveInDay } from "@/lib/trips";
import { getUser, requireUser } from "@/server/auth";
import { itineraries, itineraryItems } from "@/server/db/schema";
import { dbAsUser, type UserTx } from "@/server/db/user";
import { areaNames, engineCatalog, getSavedPreferences, toProfile } from "@/server/personalization/data";
import { proposeTrips } from "@/server/personalization/engine";
import { createClient } from "@/server/supabase/server";

// Builder (M5): Zod → utente (o nuova sessione ospite, protetta da Turnstile, per chi parte da
// un itinerario pronto senza account) → scrittura con dbAsUser. La RLS è la seconda difesa:
// un utente non modifica gli itinerari degli altri (can_edit_itinerary).

export type TripActionError = {
  status: "error";
  code: "invalid" | "captcha_failed" | "not_found" | "failed";
};

const localeSchema = z.enum(routing.locales);
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120);
const areaSlug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60);

const startSchema = z.object({
  locale: localeSchema,
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("template"), slug }),
    // Una delle proposte di "Ecco tre viaggi": il server la ricalcola, non si fida del client.
    z.object({ kind: z.literal("proposal"), area: areaSlug, variant: z.string().regex(/^[a-z_]{1,40}$/).nullable() }),
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

type NewItem = { dayIndex: number; position: number; activityId: string | null; placeId: string | null; customTitle: string | null; startTime: string | null; notes: string | null };

async function insertTrip(
  tx: UserTx,
  userId: string,
  trip: { title: string; days: number; dayTitles: string[]; templateId: string | null; startDate: string | null; travelers: number | null },
  items: NewItem[],
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into public.itineraries (owner_id, title, template_id, start_date, days, day_titles, travelers)
    values (${userId}, ${trip.title}, ${trip.templateId}, ${trip.startDate}, ${trip.days},
      ${textArray(trip.dayTitles)}, ${trip.travelers})
    returning id`);
  const id = row!.id;
  for (const item of items) {
    await tx.execute(sql`
      insert into public.itinerary_items (itinerary_id, day_index, position, activity_id, place_id, custom_title, start_time, notes)
      values (${id}, ${item.dayIndex}, ${item.position}, ${item.activityId}, ${item.placeId}, ${item.customTitle}, ${item.startTime}, ${item.notes})`);
  }
  return id;
}

// "Usa questo itinerario" e "Salva questo viaggio": crea un itinerario dell'utente (anche
// ospite) con date e persone scelte in quel momento. Da un itinerario pronto eredita i titoli
// dei giorni; da una proposta, i giorni senza titolo mostrano i luoghi delle tappe.
export async function startTrip(input: StartTripInput): Promise<TripActionError> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { locale, source, startDate, travelers, captchaToken } = parsed.data;

  const user = await sessionUser(source.kind === "template" ? captchaToken : undefined);
  if ("status" in user) return user;

  let id: string;
  try {
    if (source.kind === "template") {
      const created = await dbAsUser(user, async (tx) => {
        const [template] = await tx
          .select({ id: itineraries.id, title: itineraries.title, days: itineraries.days, dayTitles: itineraries.dayTitles })
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
            notes: itineraryItems.notes,
          })
          .from(itineraryItems)
          .where(eq(itineraryItems.itineraryId, template.id))
          .orderBy(asc(itineraryItems.dayIndex), asc(itineraryItems.position));
        return insertTrip(
          tx,
          user.id,
          { title: template.title, days: template.days, dayTitles: template.dayTitles, templateId: template.id, startDate, travelers },
          items,
        );
      });
      if (!created) return { status: "error", code: "not_found" };
      id = created;
    } else {
      const saved = await getSavedPreferences(user);
      if (!saved?.completed) return { status: "error", code: "not_found" };
      const [catalog, names, t] = await Promise.all([engineCatalog(), areaNames(locale), getTranslations({ locale, namespace: "Trips" })]);
      const { proposals } = proposeTrips(catalog, toProfile(saved));
      const proposal = proposals.find((p) => p.area === source.area && p.variant === source.variant);
      if (!proposal) return { status: "error", code: "not_found" };
      const items: NewItem[] = proposal.days.flatMap((day, d) =>
        day.activities.map((a, i) => ({ dayIndex: d, position: i, activityId: a.id, placeId: null, customTitle: null, startTime: null, notes: null })),
      );
      const title = t("proposalTripTitle", { area: names.get(proposal.area) ?? proposal.area, days: proposal.days.length });
      id = await dbAsUser(user, (tx) =>
        insertTrip(tx, user.id, { title, days: proposal.days.length, dayTitles: [], templateId: null, startDate, travelers }, items),
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
async function writeOrder(tx: UserTx, itineraryId: string, ids: string[]) {
  for (const [position, id] of ids.entries()) {
    await tx.update(itineraryItems).set({ position }).where(and(eq(itineraryItems.id, id), eq(itineraryItems.itineraryId, itineraryId)));
  }
}

async function dayIds(tx: UserTx, itineraryId: string, dayIndex: number) {
  const rows = await tx
    .select({ id: itineraryItems.id })
    .from(itineraryItems)
    .where(and(eq(itineraryItems.itineraryId, itineraryId), eq(itineraryItems.dayIndex, dayIndex)))
    .orderBy(asc(itineraryItems.position), asc(itineraryItems.id));
  return rows.map((r) => r.id);
}

export async function removeStop(input: z.input<typeof stopSchema>): Promise<TripActionError | { status: "ok" }> {
  const parsed = stopSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { itineraryId, itemId } = parsed.data;
  try {
    const found = await dbAsUser(user, async (tx) => {
      const [item] = await tx
        .delete(itineraryItems)
        .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.itineraryId, itineraryId)))
        .returning({ dayIndex: itineraryItems.dayIndex, activityId: itineraryItems.activityId });
      if (!item) return false;
      await writeOrder(tx, itineraryId, await dayIds(tx, itineraryId, item.dayIndex));
      if (item.activityId) await recordEvent(tx, user.id, "remove_from_itinerary", item.activityId, itineraryId);
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
      await writeOrder(tx, itineraryId, moveInDay(await dayIds(tx, itineraryId, item.dayIndex), itemId, direction));
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

// "Aggiungi al viaggio" dalla scheda attività: in fondo al giorno scelto.
export async function addToTrip(input: Omit<z.input<typeof addSchema>, "locale"> & { locale: string }): Promise<TripActionError> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { locale, itineraryId, activityId, dayIndex } = parsed.data;
  try {
    const ok = await dbAsUser(user, async (tx) => {
      const [trip] = await tx.select({ days: itineraries.days }).from(itineraries).where(eq(itineraries.id, itineraryId));
      if (!trip || dayIndex >= trip.days) return false;
      const position = (await dayIds(tx, itineraryId, dayIndex)).length;
      await tx.execute(sql`
        insert into public.itinerary_items (itinerary_id, day_index, position, activity_id)
        values (${itineraryId}, ${dayIndex}, ${position}, ${activityId})`);
      await recordEvent(tx, user.id, "add_to_itinerary", activityId, itineraryId);
      return true;
    });
    if (!ok) return { status: "error", code: "not_found" };
  } catch {
    return { status: "error", code: "failed" };
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
