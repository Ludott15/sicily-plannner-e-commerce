import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { MAX_TRIP_DAYS } from "@/lib/trip-days";
import { activities, interests, itineraries } from "@/server/db/schema";
import type { DbUser, UserTx } from "@/server/db/user";
import { moveStopTx, type BuilderErrorCode } from "@/server/trips/builder";
import { logItineraryChanges, stopSnapshotTx } from "@/server/trips/changes";
import { addStopTx, removeStopTx } from "@/server/trips/stops";
import type { ProposalErrorCode } from "@/server/groups/proposal-state";

// Applicazione di una proposta della chat (passo 9.1), nella stessa transazione della decisione.
// Il payload salvato NON è fidato: al momento dell'accettazione si rilegge il viaggio (esiste ed è
// accessibile a chi accetta), si ricalcola se chi accetta è membro non proprietario di un viaggio di
// gruppo (il flag asGroupProposal del payload viene ignorato), e si ricontrollano attività, giorni,
// tappe e interessi. Un errore di dominio è un ChatDomainError con il codice; qualunque eccezione
// annulla la transazione, e con lei la decisione: la proposta resta in attesa.

export type ChatActionErrorCode =
  | "invalid"
  | "not_found"
  | "stop_not_found"
  | "day_out_of_range"
  | "activity_not_available"
  | "not_allowed_for_member"
  | "unknown_interest"
  | "chat_proposal_decided"
  | "chat_proposal_not_found"
  | "chat_message_not_found"
  | "chat_message_too_large"
  | "chat_proposal_too_large"
  | "invalid_chat_status"
  | "failed"
  | BuilderErrorCode
  | ProposalErrorCode;

export class ChatDomainError extends Error {
  constructor(readonly code: ChatActionErrorCode) {
    super(code);
  }
}

const uuid = z.uuid();
const dayIndex = z.number().int().min(0).max(MAX_TRIP_DAYS - 1);

const changeSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), activityId: uuid, dayIndex, title: z.string() }),
  z.object({ op: z.literal("remove"), stopId: uuid, title: z.string() }),
  z.object({ op: z.literal("move"), stopId: uuid, dayIndex, position: z.number().int().min(0).max(999), title: z.string() }),
]);

export const itineraryPayloadSchema = z.object({
  itineraryId: uuid,
  changes: z.array(changeSchema).min(1).max(10),
  asGroupProposal: z.boolean(),
});

export const preferencePayloadSchema = z.object({
  interestKey: z.string().regex(/^[a-z_]{1,40}$/),
  interestLabel: z.string(),
  from: z.number().int().min(0).max(5),
  to: z.number().int().min(0).max(5),
  reason: z.string(),
});

export type ItineraryPayload = z.infer<typeof itineraryPayloadSchema>;
export type PreferencePayload = z.infer<typeof preferencePayloadSchema>;

// Applica le modifiche di un viaggio con i controlli di accettazione (vedi intestazione).
// Aggiungere passa da addStopTx, che propone al posto dell'utente se il viaggio è di un gruppo e
// lui non ne è il proprietario: la stessa regola di addToTrip.
export async function applyItineraryPayload(tx: UserTx, user: DbUser, payload: ItineraryPayload): Promise<void> {
  const [trip] = await tx
    .select({ id: itineraries.id, days: itineraries.days, groupId: itineraries.groupId, ownerId: itineraries.ownerId })
    .from(itineraries)
    .where(eq(itineraries.id, payload.itineraryId));
  if (!trip) throw new ChatDomainError("not_found");
  const memberNotOwner = trip.groupId !== null && trip.ownerId !== user.id;

  for (const change of payload.changes) {
    if (change.op === "add") {
      if (change.dayIndex >= trip.days) throw new ChatDomainError("day_out_of_range");
      const [activity] = await tx
        .select({ id: activities.id })
        .from(activities)
        .where(and(eq(activities.id, change.activityId), eq(activities.isActive, true)));
      if (!activity) throw new ChatDomainError("activity_not_available");
      const outcome = await addStopTx(tx, user, {
        itineraryId: trip.id,
        activityId: change.activityId,
        dayIndex: change.dayIndex,
      });
      if (outcome.kind === "missing") throw new ChatDomainError("not_found");
      if (outcome.kind === "proposed" && outcome.state.status === "error") throw new ChatDomainError(outcome.state.code);
      continue;
    }

    // Togliere o spostare è riservato al proprietario, come in tools.ts (non_allowed_for_member).
    if (memberNotOwner) throw new ChatDomainError("not_allowed_for_member");
    if (change.op === "remove") {
      const removed = await removeStopTx(tx, user, trip.id, change.stopId);
      if (!removed) throw new ChatDomainError("stop_not_found");
      continue;
    }
    if (change.dayIndex >= trip.days) throw new ChatDomainError("day_out_of_range");
    const before = await stopSnapshotTx(tx, change.stopId);
    if (!before || before.itineraryId !== trip.id) throw new ChatDomainError("stop_not_found");
    const result = await moveStopTx(tx, change.stopId, change.dayIndex, change.position);
    if (!result.ok) throw new ChatDomainError(result.code);
    if (before.dayIndex !== change.dayIndex) {
      await logItineraryChanges(tx, {
        itineraryId: trip.id,
        actorId: user.id,
        changes: [{ kind: "stop_moved", payload: { title: before.title, day: change.dayIndex + 1 } }],
      });
    }
  }
}

// Il peso dell'interesse diventa quello proposto. L'interesse deve esistere nella tabella interests.
export async function applyPreferencePayload(tx: UserTx, user: DbUser, payload: PreferencePayload): Promise<void> {
  const [interest] = await tx.select({ key: interests.key }).from(interests).where(eq(interests.key, payload.interestKey));
  if (!interest) throw new ChatDomainError("unknown_interest");
  await tx.execute(sql`
    insert into public.preference_weights (user_id, interest_key, explicit)
    values (${user.id}::uuid, ${interest.key}, ${payload.to})
    on conflict (user_id, interest_key) do update set explicit = excluded.explicit, updated_at = now()`);
}

export type ProposalRow = { id: string; kind: string; payload: unknown };

// Riga appena decisa come accettata: valida il payload e lo applica.
export async function applyAcceptedProposal(tx: UserTx, user: DbUser, row: ProposalRow): Promise<void> {
  if (row.kind === "itinerary") {
    const parsed = itineraryPayloadSchema.safeParse(row.payload);
    if (!parsed.success) throw new ChatDomainError("invalid");
    await applyItineraryPayload(tx, user, parsed.data);
    return;
  }
  if (row.kind === "preference") {
    const parsed = preferencePayloadSchema.safeParse(row.payload);
    if (!parsed.success) throw new ChatDomainError("invalid");
    await applyPreferencePayload(tx, user, parsed.data);
    return;
  }
  throw new ChatDomainError("invalid");
}
