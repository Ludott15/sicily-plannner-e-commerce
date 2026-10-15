"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { dbAsUser } from "@/server/db/user";
import { proposalErrorCodeOf, type ProposalFormState } from "./proposal-state";
import { proposeStopTx } from "./proposals";

// Proposte e sostituzioni dei viaggi di gruppo (passo 4.2). Ogni azione: Zod → requireUser →
// dbAsUser. Le decisioni passano da funzioni SECURITY DEFINER (decide_proposal, replace_group_stop)
// che verificano l'owner; gli errori di dominio arrivano come P0001 e si mappano in ProposalErrorCode.

export type { ProposalFormState } from "./proposal-state";

const OK: ProposalFormState = { status: "ok" };

function fail(error: unknown): ProposalFormState {
  return { status: "error", code: proposalErrorCodeOf(error) };
}

const proposeSchema = z.object({
  itineraryId: z.uuid(),
  activityId: z.uuid(),
  dayIndex: z.number().int().min(0).max(59),
});

// "Proponi al gruppo": il membro propone un'attività per un giorno del viaggio.
export async function proposeStop(
  _prev: ProposalFormState,
  input: { itineraryId: string; activityId: string; dayIndex: number },
): Promise<ProposalFormState> {
  const parsed = proposeSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  let state: ProposalFormState;
  try {
    state = await dbAsUser(user, (tx) => proposeStopTx(tx, user, parsed.data));
  } catch (error) {
    return fail(error);
  }
  if (state.status === "ok") revalidatePath("/", "layout");
  return state;
}

const decideSchema = z.object({ proposalId: z.uuid(), accept: z.boolean() });

// Il proprietario accetta (la tappa entra in fondo al giorno) o rifiuta. Il proponente riceve la notifica.
export async function decideProposal(
  _prev: ProposalFormState,
  input: { proposalId: string; accept: boolean },
): Promise<ProposalFormState> {
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { proposalId, accept } = parsed.data;
  try {
    await dbAsUser(user, (tx) =>
      tx.execute(sql`select public.decide_proposal(${proposalId}::uuid, ${accept}::boolean)`),
    );
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/", "layout");
  return OK;
}

const replaceSchema = z.object({ itemId: z.uuid(), activityId: z.uuid() });

// Sostituisce l'attività di una tappa di un gruppo con un'alternativa. Solo il proprietario.
export async function replaceStop(
  _prev: ProposalFormState,
  input: { itemId: string; activityId: string },
): Promise<ProposalFormState> {
  const parsed = replaceSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { itemId, activityId } = parsed.data;
  try {
    await dbAsUser(user, (tx) =>
      tx.execute(sql`select public.replace_group_stop(${itemId}::uuid, ${activityId}::uuid)`),
    );
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/", "layout");
  return OK;
}
