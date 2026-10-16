import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { groups, itineraries, itineraryItems } from "@/server/db/schema";
import type { DbUser, UserTx } from "@/server/db/user";
import { proposeStopTx } from "@/server/groups/proposals";
import type { ProposalFormState } from "@/server/groups/proposal-state";
import { dayStopIds, writePlacements } from "./builder";
import { activityTitleTx, logItineraryChanges, stopSnapshotTx } from "./changes";

// Funzioni transazionali delle tappe del viaggio, condivise dalle Server Action di actions.ts e
// dal chatbot (applicazione delle proposte). Nessun redirect, nessun revalidatePath: chi chiama
// decide l'esito e la cache. Questo file non è "use server": le sue funzioni non diventano
// endpoint raggiungibili dal client.

// Registra l'evento di uso dell'attività (user_events, il cron della M11 li elabora).
export async function recordEvent(
  tx: UserTx,
  userId: string,
  type: "add_to_itinerary" | "remove_from_itinerary",
  activityId: string,
  itineraryId: string,
): Promise<void> {
  await tx.execute(sql`
    insert into public.user_events (user_id, type, activity_id, itinerary_id)
    values (${userId}, ${type}, ${activityId}, ${itineraryId})`);
}

// Riscrive le posizioni di una giornata nell'ordine dato (0, 1, 2…).
export async function writeOrder(tx: UserTx, itineraryId: string, dayIndex: number, ids: string[]): Promise<void> {
  await writePlacements(
    tx,
    itineraryId,
    ids.map((id, position) => ({ id, dayIndex, position })),
  );
}

export type AddOutcome = { kind: "added" } | { kind: "proposed"; state: ProposalFormState } | { kind: "missing" };

export type AddStopInput = { itineraryId: string; activityId: string; dayIndex: number };

// Aggiunge un'attività in fondo al giorno. Se il viaggio è di un gruppo e chi aggiunge non ne è il
// proprietario, l'aggiunta diventa una proposta (proposeStopTx). Nella transazione dell'utente.
export async function addStopTx(tx: UserTx, user: DbUser, input: AddStopInput): Promise<AddOutcome> {
  const { itineraryId, activityId, dayIndex } = input;
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
}

// Toglie una tappa, riordina la giornata e registra l'evento. false se la tappa non è di quel viaggio
// (o non è visibile all'utente).
export async function removeStopTx(tx: UserTx, user: DbUser, itineraryId: string, itemId: string): Promise<boolean> {
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
}
