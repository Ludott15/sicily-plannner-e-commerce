import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { activities, itineraries } from "@/server/db/schema";
import type { DbUser, UserTx } from "@/server/db/user";
import type { ProposalFormState } from "./proposal-state";

// Proposta di aggiunta di un'attività a un viaggio di gruppo (passo 4.2). Il proponente è un membro
// non proprietario: addToTrip la usa al posto dell'aggiunta diretta. La RLS di itinerary_proposals
// resta la seconda difesa (membro, non ospite, attività attiva).

export type ProposalInput = { itineraryId: string; activityId: string; dayIndex: number };

function fail(code: Extract<ProposalFormState, { status: "error" }>["code"]): ProposalFormState {
  return { status: "error", code };
}

// Controlli di dominio e insert nella transazione dell'utente. Errori di dominio come stato; un
// errore di scrittura (RLS) lancia, e chi chiama lo mappa con proposalErrorCodeOf.
export async function proposeStopTx(tx: UserTx, user: DbUser, input: ProposalInput): Promise<ProposalFormState> {
  if (user.is_anonymous) return fail("guest_not_allowed");

  // Il viaggio è visibile solo ai membri del gruppo (RLS): se manca, chi propone non è membro.
  const [trip] = await tx
    .select({ days: itineraries.days, groupId: itineraries.groupId })
    .from(itineraries)
    .where(eq(itineraries.id, input.itineraryId));
  if (!trip || trip.groupId === null) return fail("not_group_member");
  if (input.dayIndex < 0 || input.dayIndex >= trip.days) return fail("day_out_of_range");

  const [activity] = await tx
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.id, input.activityId), eq(activities.isActive, true)));
  if (!activity) return fail("activity_not_available");

  await tx.execute(sql`
    insert into public.itinerary_proposals (itinerary_id, proposed_by, activity_id, day_index)
    values (${input.itineraryId}::uuid, ${user.id}::uuid, ${input.activityId}::uuid, ${input.dayIndex}::smallint)`);
  return { status: "ok" };
}
