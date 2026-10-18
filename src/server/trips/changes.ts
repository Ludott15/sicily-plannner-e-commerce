import "server-only";
import { sql } from "drizzle-orm";
import type { ChangeKind } from "@/lib/group-changes";
import type { UserTx } from "@/server/db/user";

// Registro delle modifiche del viaggio di gruppo (passo 4.2). Le funzioni scrivono nella stessa
// transazione dell'azione che cambia il viaggio, come l'utente che la compie (RLS: can_edit_itinerary).
// Il registro si scrive solo se l'itinerario ha un gruppo: un viaggio personale non lascia traccia.

export type ChangePayload = Record<string, string | number | null>;
export type ChangeInput = { kind: ChangeKind; payload: ChangePayload };

// Una sola istruzione per più voci; nessuna query dentro i cicli.
export async function logItineraryChanges(
  tx: UserTx,
  input: { itineraryId: string; actorId: string; changes: readonly ChangeInput[] },
): Promise<void> {
  if (input.changes.length === 0) return;
  const [trip] = await tx.execute<{ group_id: string | null }>(sql`
    select group_id from public.itineraries where id = ${input.itineraryId}::uuid`);
  if (!trip?.group_id) return;
  const rows = sql.join(
    input.changes.map(
      (c) => sql`(${input.itineraryId}::uuid, ${input.actorId}::uuid, ${c.kind}, ${JSON.stringify(c.payload)}::jsonb)`,
    ),
    sql`, `,
  );
  await tx.execute(sql`
    insert into public.itinerary_changes (itinerary_id, actor_id, kind, payload)
    values ${rows}`);
}

export async function logItineraryChange(
  tx: UserTx,
  input: { itineraryId: string; actorId: string; kind: ChangeKind; payload: ChangePayload },
): Promise<void> {
  await logItineraryChanges(tx, {
    itineraryId: input.itineraryId,
    actorId: input.actorId,
    changes: [{ kind: input.kind, payload: input.payload }],
  });
}

export type StopSnapshot = { id: string; itineraryId: string; dayIndex: number; title: string };

// Titolo di una tappa come lo mostra il viaggio: attività, poi voce libera, poi luogo.
const TITLE_SQL = sql`coalesce(a.title, ii.custom_title, pl.name, '')`;

// Una tappa (null se non esiste o non è visibile con la RLS dell'utente).
export async function stopSnapshotTx(tx: UserTx, stopId: string): Promise<StopSnapshot | null> {
  const rows = await tx.execute<{ id: string; itinerary_id: string; day_index: number; title: string }>(sql`
    select ii.id, ii.itinerary_id, ii.day_index, ${TITLE_SQL} as title
    from public.itinerary_items ii
    left join public.activities a on a.id = ii.activity_id
    left join public.places pl on pl.id = coalesce(ii.place_id, a.place_id)
    where ii.id = ${stopId}::uuid`);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, itineraryId: row.itinerary_id, dayIndex: Number(row.day_index), title: row.title };
}

// Tutte le tappe di un viaggio in una query sola (per il riordino).
export async function tripStopsTx(tx: UserTx, tripId: string): Promise<StopSnapshot[]> {
  const rows = await tx.execute<{ id: string; itinerary_id: string; day_index: number; title: string }>(sql`
    select ii.id, ii.itinerary_id, ii.day_index, ${TITLE_SQL} as title
    from public.itinerary_items ii
    left join public.activities a on a.id = ii.activity_id
    left join public.places pl on pl.id = coalesce(ii.place_id, a.place_id)
    where ii.itinerary_id = ${tripId}::uuid`);
  return rows.map((row) => ({
    id: row.id,
    itineraryId: row.itinerary_id,
    dayIndex: Number(row.day_index),
    title: row.title,
  }));
}

// Titolo di un'attività (stringa vuota se non esiste).
export async function activityTitleTx(tx: UserTx, activityId: string): Promise<string> {
  const [row] = await tx.execute<{ title: string }>(sql`
    select title from public.activities where id = ${activityId}::uuid`);
  return row?.title ?? "";
}
