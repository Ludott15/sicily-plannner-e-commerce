import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { MAX_TRIP_DAYS, planRemoveDay, setAt } from "@/lib/trip-days";
import type { TimeSlot } from "@/lib/itinerary-checks";
import { itineraries, itineraryItems, itineraryNights, itineraryShareLinks } from "@/server/db/schema";
import type { DbUser, UserTx } from "@/server/db/user";

// Scritture del builder (M5, 1.4). Ogni funzione riceve la transazione di dbAsUser: la RLS
// decide chi può modificare (can_edit_itinerary). Regola di queste funzioni: la prima scrittura
// è quella che fa da cancello di autorizzazione (update o delete con returning). Se una scrittura
// successiva fallisce si lancia un errore, così la transazione torna indietro: un ritorno con
// codice non annulla le scritture già fatte.
// Nei cicli non si fanno query: le scritture multiple sono una sola istruzione.

export type BuilderErrorCode = "invalid" | "not_found" | "day_limit" | "last_day";

export type BuilderResult<T = void> = { ok: true; value: T } | { ok: false; code: BuilderErrorCode };

const DONE: BuilderResult = { ok: true, value: undefined };
const fail = (code: BuilderErrorCode): { ok: false; code: BuilderErrorCode } => ({ ok: false, code });
const ok = <T>(value: T): BuilderResult<T> => ({ ok: true, value });

export type Placement = { id: string; dayIndex: number; position: number };

// Giorno e posizione di più tappe in un'istruzione sola. Se la RLS o il filtro su itinerary_id
// non lasciano scrivere tutte le righe, si lancia un errore: la transazione torna indietro.
export async function writePlacements(tx: UserTx, itineraryId: string, rows: readonly Placement[]): Promise<void> {
  if (rows.length === 0) return;
  const values = sql.join(
    rows.map((r) => sql`(${r.id}::uuid, ${r.dayIndex}::smallint, ${r.position}::smallint)`),
    sql`, `,
  );
  const written = await tx.execute<{ id: string }>(sql`
    update public.itinerary_items as ii
    set day_index = v.day_index, position = v.position
    from (values ${values}) as v(id, day_index, position)
    where ii.id = v.id and ii.itinerary_id = ${itineraryId}
    returning ii.id`);
  if (written.length !== rows.length) throw new Error("placement_write_incomplete");
}

// Id delle tappe di un giorno, nell'ordine di posizione.
export async function dayStopIds(tx: UserTx, itineraryId: string, dayIndex: number): Promise<string[]> {
  const rows = await tx
    .select({ id: itineraryItems.id })
    .from(itineraryItems)
    .where(and(eq(itineraryItems.itineraryId, itineraryId), eq(itineraryItems.dayIndex, dayIndex)))
    .orderBy(asc(itineraryItems.position), asc(itineraryItems.id));
  return rows.map((r) => r.id);
}

// Sposta una tappa nel giorno e alla posizione indicati (la posizione è l'indice tra le tappe
// del giorno di arrivo, senza contare la tappa stessa). Riordina anche il giorno di partenza.
export async function moveStopTx(tx: UserTx, stopId: string, dayIndex: number, position: number): Promise<BuilderResult> {
  const [item] = await tx
    .select({ itineraryId: itineraryItems.itineraryId, dayIndex: itineraryItems.dayIndex })
    .from(itineraryItems)
    .where(eq(itineraryItems.id, stopId));
  if (!item) return fail("not_found");
  const [trip] = await tx.select({ days: itineraries.days }).from(itineraries).where(eq(itineraries.id, item.itineraryId));
  if (!trip) return fail("not_found");
  if (dayIndex >= trip.days) return fail("invalid");

  const target = (await dayStopIds(tx, item.itineraryId, dayIndex)).filter((id) => id !== stopId);
  target.splice(Math.min(position, target.length), 0, stopId);
  const rows: Placement[] = target.map((id, p) => ({ id, dayIndex, position: p }));

  if (item.dayIndex !== dayIndex) {
    const source = (await dayStopIds(tx, item.itineraryId, item.dayIndex)).filter((id) => id !== stopId);
    rows.push(...source.map((id, p) => ({ id, dayIndex: item.dayIndex, position: p })));
  }
  await writePlacements(tx, item.itineraryId, rows);
  return DONE;
}

// Riordino completo: deve contenere tutte le tappe del viaggio, una volta sola, con giorni validi
// e nessuna coppia giorno/posizione ripetuta.
export async function reorderTripTx(tx: UserTx, tripId: string, rows: readonly Placement[]): Promise<BuilderResult> {
  const [trip] = await tx.select({ days: itineraries.days }).from(itineraries).where(eq(itineraries.id, tripId));
  if (!trip) return fail("not_found");

  const current = await tx.select({ id: itineraryItems.id }).from(itineraryItems).where(eq(itineraryItems.itineraryId, tripId));
  const currentIds = new Set(current.map((c) => c.id));
  const ids = new Set(rows.map((r) => r.id));
  const slots = new Set(rows.map((r) => `${r.dayIndex}:${r.position}`));
  if (rows.length !== current.length || ids.size !== rows.length || slots.size !== rows.length) return fail("invalid");
  if (rows.some((r) => !currentIds.has(r.id) || r.dayIndex >= trip.days)) return fail("invalid");

  await writePlacements(tx, tripId, rows);
  return DONE;
}

// Aggiunge un giorno in fondo. Il confronto su days rende l'aggiornamento sicuro se due richieste
// arrivano insieme.
export async function addDayTx(tx: UserTx, tripId: string): Promise<BuilderResult> {
  const [trip] = await tx.select({ days: itineraries.days }).from(itineraries).where(eq(itineraries.id, tripId));
  if (!trip) return fail("not_found");
  if (trip.days >= MAX_TRIP_DAYS) return fail("day_limit");
  const updated = await tx
    .update(itineraries)
    .set({ days: trip.days + 1 })
    .where(and(eq(itineraries.id, tripId), eq(itineraries.days, trip.days)))
    .returning({ id: itineraries.id });
  return updated.length > 0 ? DONE : fail("not_found");
}

// Toglie un giorno: le tappe del giorno escono, quelle dopo scalano di uno; titoli, note e
// introduzioni perdono la voce del giorno; le notti si rinumerano (vedi planRemoveDay).
export async function removeDayTx(tx: UserTx, tripId: string, dayIndex: number): Promise<BuilderResult> {
  const [trip] = await tx
    .select({
      days: itineraries.days,
      dayTitles: itineraries.dayTitles,
      dayNotes: itineraries.dayNotes,
      dayIntros: itineraries.dayIntros,
    })
    .from(itineraries)
    .where(eq(itineraries.id, tripId));
  if (!trip) return fail("not_found");
  if (trip.days <= 1) return fail("last_day");
  if (dayIndex >= trip.days) return fail("invalid");

  const nightRows = await tx
    .select({ nightIndex: itineraryNights.nightIndex, areaId: itineraryNights.areaId, placeId: itineraryNights.placeId })
    .from(itineraryNights)
    .where(eq(itineraryNights.itineraryId, tripId));
  const plan = planRemoveDay({
    days: trip.days,
    dayIndex,
    nights: nightRows.map((n) => n.nightIndex),
    dayTitles: trip.dayTitles,
    dayNotes: trip.dayNotes,
    dayIntros: trip.dayIntros,
  });
  if (!plan) return fail("invalid");

  // Prima scrittura: il cancello di autorizzazione e di concorrenza. Con due richieste insieme la
  // seconda trova days già cambiato, non aggiorna nulla e non tocca le tappe dei giorni spostati.
  const updated = await tx
    .update(itineraries)
    .set({ days: plan.days, dayTitles: plan.dayTitles, dayNotes: plan.dayNotes, dayIntros: plan.dayIntros })
    .where(and(eq(itineraries.id, tripId), eq(itineraries.days, trip.days)))
    .returning({ id: itineraries.id });
  if (updated.length === 0) return fail("not_found");

  await tx.delete(itineraryItems).where(and(eq(itineraryItems.itineraryId, tripId), eq(itineraryItems.dayIndex, dayIndex)));
  await tx
    .update(itineraryItems)
    .set({ dayIndex: sql`${itineraryItems.dayIndex} - 1` })
    .where(and(eq(itineraryItems.itineraryId, tripId), gt(itineraryItems.dayIndex, dayIndex)));

  // Notti: si riscrivono con il nuovo nightIndex, area e luogo invariati. La chiave è
  // (itinerary_id, night_index): per questo si cancellano tutte e si reinseriscono.
  const byFrom = new Map(nightRows.map((n) => [n.nightIndex, n]));
  const kept = plan.nights.flatMap(({ from, to }) => {
    const row = byFrom.get(from);
    return row ? [{ itineraryId: tripId, nightIndex: to, areaId: row.areaId, placeId: row.placeId }] : [];
  });
  await tx.delete(itineraryNights).where(eq(itineraryNights.itineraryId, tripId));
  // Insert in SQL esplicito: authenticated ha il grant solo su queste colonne, e l'insert di Drizzle
  // le elencherebbe tutte (anche created_at con default).
  if (kept.length > 0) {
    const rows = sql.join(
      kept.map((n) => sql`(${n.itineraryId}::uuid, ${n.nightIndex}::smallint, ${n.areaId}::uuid, ${n.placeId}::uuid)`),
      sql`, `,
    );
    await tx.execute(sql`insert into public.itinerary_nights (itinerary_id, night_index, area_id, place_id) values ${rows}`);
  }
  return DONE;
}

// Titolo della copia: prefisso più titolo, troncato a 200 caratteri (come il vincolo del database).
export function copyTitle(prefix: string, title: string): string {
  return Array.from(`${prefix}${title}`).slice(0, 200).join("");
}

// Copia del viaggio dell'utente: stesse date, giorni, persone, ritmo, titoli, note e tappe; owner
// = chi copia; nessun gruppo. Ritorna l'id della copia, o null se il viaggio non è visibile.
export async function duplicateTripTx(tx: UserTx, user: DbUser, tripId: string, prefix: string): Promise<string | null> {
  const [source] = await tx
    .select({
      title: itineraries.title,
      days: itineraries.days,
      travelers: itineraries.travelers,
      pace: itineraries.pace,
      startDate: itineraries.startDate,
      templateId: itineraries.templateId,
      dayTitles: itineraries.dayTitles,
      dayNotes: itineraries.dayNotes,
      dayIntros: itineraries.dayIntros,
    })
    .from(itineraries)
    .where(and(eq(itineraries.id, tripId), eq(itineraries.isTemplate, false)));
  if (!source) return null;

  // SQL esplicito con le sole colonne concesse ad authenticated (come insertTrip in actions.ts).
  const [created] = await tx.execute<{ id: string }>(sql`
    insert into public.itineraries (owner_id, title, days, travelers, pace, start_date, template_id, day_titles, day_notes, day_intros)
    select ${user.id}, ${copyTitle(prefix, source.title)}, days, travelers, pace, start_date, template_id, day_titles, day_notes, day_intros
    from public.itineraries where id = ${tripId}
    returning id`);
  if (!created) throw new Error("duplicate_trip_insert_failed");

  await tx.execute(sql`
    insert into public.itinerary_items (itinerary_id, day_index, position, activity_id, place_id, custom_title, start_time, time_slot, notes)
    select ${created.id}, day_index, position, activity_id, place_id, custom_title, start_time, time_slot, notes
    from public.itinerary_items where itinerary_id = ${tripId}`);
  await tx.execute(sql`
    insert into public.itinerary_nights (itinerary_id, night_index, area_id, place_id)
    select ${created.id}, night_index, area_id, place_id
    from public.itinerary_nights where itinerary_id = ${tripId}`);
  return created.id;
}

// Campi del viaggio modificabili dalle impostazioni.
export type TripSettings = {
  title: string;
  startDate: string | null;
  travelers: number | null;
  pace: "relaxed" | "balanced" | "intense" | null;
};

export async function updateTripSettingsTx(tx: UserTx, tripId: string, settings: TripSettings): Promise<BuilderResult> {
  const updated = await tx
    .update(itineraries)
    .set({ title: settings.title, startDate: settings.startDate, travelers: settings.travelers, pace: settings.pace })
    .where(eq(itineraries.id, tripId))
    .returning({ id: itineraries.id });
  return updated.length > 0 ? DONE : fail("not_found");
}

export async function saveDayNoteTx(tx: UserTx, tripId: string, dayIndex: number, note: string): Promise<BuilderResult> {
  const [trip] = await tx
    .select({ days: itineraries.days, dayNotes: itineraries.dayNotes })
    .from(itineraries)
    .where(eq(itineraries.id, tripId));
  if (!trip) return fail("not_found");
  if (dayIndex >= trip.days) return fail("invalid");
  const updated = await tx
    .update(itineraries)
    .set({ dayNotes: setAt(trip.dayNotes, dayIndex, note) })
    .where(eq(itineraries.id, tripId))
    .returning({ id: itineraries.id });
  return updated.length > 0 ? DONE : fail("not_found");
}

export async function saveStopNoteTx(
  tx: UserTx,
  stopId: string,
  note: string | null,
  timeSlot: TimeSlot | null,
): Promise<BuilderResult> {
  const updated = await tx
    .update(itineraryItems)
    .set({ notes: note, timeSlot })
    .where(eq(itineraryItems.id, stopId))
    .returning({ id: itineraryItems.id });
  return updated.length > 0 ? DONE : fail("not_found");
}

export async function deleteTripTx(tx: UserTx, tripId: string): Promise<BuilderResult> {
  const deleted = await tx.delete(itineraries).where(eq(itineraries.id, tripId)).returning({ id: itineraries.id });
  return deleted.length > 0 ? DONE : fail("not_found");
}

// Token del link pubblico: 32 byte casuali in base64url (43 caratteri). Si conserva solo l'hash.
export function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

// Hash SHA-256 in hex del token, come lo calcola public.shared_itinerary (su UTF-8).
export function shareTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Crea un nuovo link attivo e revoca quello precedente (Rigenera). Ritorna il token in chiaro:
// va mostrato una volta sola.
export async function createShareLinkTx(tx: UserTx, user: DbUser, tripId: string): Promise<BuilderResult<string>> {
  const [trip] = await tx
    .select({ id: itineraries.id })
    .from(itineraries)
    .where(and(eq(itineraries.id, tripId), eq(itineraries.isTemplate, false)));
  if (!trip) return fail("not_found");

  const token = newShareToken();
  await tx
    .update(itineraryShareLinks)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(itineraryShareLinks.itineraryId, tripId), isNull(itineraryShareLinks.revokedAt)));
  await tx.execute(sql`
    insert into public.itinerary_share_links (itinerary_id, token_hash, created_by)
    values (${tripId}, ${shareTokenHash(token)}, ${user.id})`);
  return ok(token);
}

export async function revokeShareLinkTx(tx: UserTx, tripId: string): Promise<BuilderResult> {
  const [trip] = await tx.select({ id: itineraries.id }).from(itineraries).where(eq(itineraries.id, tripId));
  if (!trip) return fail("not_found");
  await tx
    .update(itineraryShareLinks)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(itineraryShareLinks.itineraryId, tripId), isNull(itineraryShareLinks.revokedAt)));
  return DONE;
}
