"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { chatSessions } from "@/server/db/schema";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { proposalErrorCodeOf } from "@/server/groups/proposal-state";
import { applyAcceptedProposal, ChatDomainError, type ChatActionErrorCode, type ProposalRow } from "./apply";

// Azioni della chat (passo 9.1): accettare o rifiutare una proposta, eliminare e rinominare una
// sessione. Ogni azione: FormData → Zod → requireUser → dbAsUser. Accettare una proposta è una sola
// transazione: la decisione (decide_chat_proposal) e l'applicazione con le stesse funzioni delle
// azioni del viaggio. Se una modifica non si può applicare, tutto si annulla e la proposta resta in attesa.
// Questo file è "use server": esporta solo le azioni async e i tipi.

export type ChatActionState = { status: "ok" } | { status: "error"; code: ChatActionErrorCode };

const DOMAIN_CODES: readonly string[] = [
  "not_found",
  "chat_proposal_decided",
  "chat_proposal_not_found",
  "invalid_chat_status",
  "day_limit",
  "last_day",
  "invalid",
  "not_group_member",
  "guest_not_allowed",
  "day_out_of_range",
  "activity_not_available",
  "stop_not_found",
  "not_allowed_for_member",
  "unknown_interest",
  "chat_message_not_found",
  "chat_message_too_large",
  "chat_proposal_too_large",
];

function errorCodeOf(error: unknown): ChatActionErrorCode {
  if (error instanceof ChatDomainError) return error.code;
  if (error instanceof Error) {
    // Drizzle avvolge l'errore di Postgres: il codice di dominio sta nel messaggio della causa.
    const cause = (error as { cause?: { message?: unknown } }).cause;
    const message = typeof cause?.message === "string" ? cause.message : error.message;
    const match = DOMAIN_CODES.find((code) => message === code);
    if (match) return match as ChatActionErrorCode;
    return proposalErrorCodeOf(error);
  }
  return "failed";
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function decideAndApply(user: DbUser, proposalId: string, status: "accepted" | "rejected"): Promise<void> {
  await dbAsUser(user, async (tx) => {
    const [row] = await tx.execute<ProposalRow>(sql`
      select * from public.decide_chat_proposal(${proposalId}::uuid, ${status})`);
    if (!row) throw new ChatDomainError("chat_proposal_not_found");
    if (status === "accepted") await applyAcceptedProposal(tx, user, row);
  });
}

const uuid = z.uuid();

export async function acceptChatProposal(formData: FormData): Promise<ChatActionState> {
  const parsed = uuid.safeParse(field(formData, "proposalId"));
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  try {
    await decideAndApply(user, parsed.data, "accepted");
  } catch (error) {
    return { status: "error", code: errorCodeOf(error) };
  }
  revalidatePath("/", "layout");
  return { status: "ok" };
}

export async function rejectChatProposal(formData: FormData): Promise<ChatActionState> {
  const parsed = uuid.safeParse(field(formData, "proposalId"));
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  try {
    await decideAndApply(user, parsed.data, "rejected");
  } catch (error) {
    return { status: "error", code: errorCodeOf(error) };
  }
  revalidatePath("/", "layout");
  return { status: "ok" };
}

export async function deleteChatSession(formData: FormData): Promise<ChatActionState> {
  const parsed = uuid.safeParse(field(formData, "sessionId"));
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  try {
    const deleted = await dbAsUser(user, (tx) =>
      tx.delete(chatSessions).where(eq(chatSessions.id, parsed.data)).returning({ id: chatSessions.id }),
    );
    if (deleted.length === 0) return { status: "error", code: "not_found" };
  } catch {
    return { status: "error", code: "failed" };
  }
  revalidatePath("/chat");
  return { status: "ok" };
}

export async function renameChatSession(formData: FormData): Promise<ChatActionState> {
  const parsed = z
    .object({ sessionId: uuid, title: z.string().trim().min(1).max(80) })
    .safeParse({ sessionId: field(formData, "sessionId"), title: field(formData, "title") });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  try {
    const updated = await dbAsUser(user, (tx) =>
      tx
        .update(chatSessions)
        .set({ title: parsed.data.title })
        .where(eq(chatSessions.id, parsed.data.sessionId))
        .returning({ id: chatSessions.id }),
    );
    if (updated.length === 0) return { status: "error", code: "not_found" };
  } catch {
    return { status: "error", code: "failed" };
  }
  revalidatePath("/chat");
  return { status: "ok" };
}
