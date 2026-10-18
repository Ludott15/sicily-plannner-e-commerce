import "server-only";
import { sql } from "drizzle-orm";
import type { ChatActivityCard, ChatProposal } from "@/lib/chat/events";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";
import { chatEnabled, dailyLimitFor } from "./config";
import { contentText, toolCards } from "./context";
import { itineraryPayloadSchema, preferencePayloadSchema } from "./apply";

// Letture per le pagine della chat (passo 9.1). Tutte con dbAsUser: la RLS limita le sessioni, i
// messaggi e le proposte al proprietario. I riassunti non compaiono mai nella cronologia.

export type ChatHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards: ChatActivityCard[];
  createdAt: string;
};

export type ChatSessionSummary = { id: string; title: string | null; itineraryId: string | null; updatedAt: string };

export type ChatSessionDetail = {
  id: string;
  title: string | null;
  itineraryId: string | null;
  messages: ChatHistoryMessage[];
  proposals: ChatProposal[];
  remainingToday: number;
};

export async function listChatSessions(user: DbUser): Promise<ChatSessionSummary[]> {
  return dbAsUser(user, async (tx: UserTx) => {
    const rows = await tx.execute<{ id: string; title: string | null; itinerary_id: string | null; updated_at: string }>(sql`
      select s.id, s.title, s.itinerary_id,
        coalesce((select max(m.created_at) from public.chat_messages m where m.session_id = s.id), s.created_at) as updated_at
      from public.chat_sessions s
      order by updated_at desc
      limit 100`);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      itineraryId: row.itinerary_id,
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  });
}

type ProposalRow = { id: string; kind: string; status: string; payload: unknown };

const STATUSES: readonly string[] = ["pending", "accepted", "rejected"];

// Le proposte salvate (jsonb) diventano il tipo ChatProposal solo se il payload passa gli stessi
// schemi di accettazione (apply.ts) e lo stato è valido. Una riga non valida si scarta: non compare.
export function proposalFromRow(row: ProposalRow): ChatProposal | null {
  if (!STATUSES.includes(row.status)) return null;
  const status = row.status as ChatProposal["status"];
  if (row.kind === "itinerary") {
    const parsed = itineraryPayloadSchema.safeParse(row.payload);
    if (!parsed.success) return null;
    return {
      id: row.id,
      kind: "itinerary",
      itineraryId: parsed.data.itineraryId,
      changes: parsed.data.changes,
      status,
      asGroupProposal: parsed.data.asGroupProposal,
    };
  }
  if (row.kind === "preference") {
    const parsed = preferencePayloadSchema.safeParse(row.payload);
    if (!parsed.success) return null;
    return {
      id: row.id,
      kind: "preference",
      interestKey: parsed.data.interestKey,
      interestLabel: parsed.data.interestLabel,
      from: parsed.data.from,
      to: parsed.data.to,
      reason: parsed.data.reason,
      status,
    };
  }
  return null;
}

export async function getChatSession(user: DbUser, id: string): Promise<ChatSessionDetail | null> {
  return dbAsUser(user, async (tx: UserTx) => {
    const [session] = await tx.execute<{ id: string; title: string | null; itinerary_id: string | null }>(sql`
      select id, title, itinerary_id from public.chat_sessions where id = ${id}::uuid`);
    if (!session) return null;

    const messages = await tx.execute<{ id: string; role: string; content: unknown; tool_calls: unknown; created_at: string }>(sql`
      select id, role, content, tool_calls, created_at
      from public.chat_messages
      where session_id = ${id}::uuid
        and role in ('user', 'assistant')
        and coalesce(content->>'kind', '') <> 'summary'
      order by created_at asc`);
    const proposals = await tx.execute<ProposalRow>(sql`
      select id, kind, status, payload from public.chat_proposals
      where session_id = ${id}::uuid
      order by created_at asc`);
    const [today] = await tx.execute<{ n: number }>(sql`select public.chat_messages_today()::int as n`);

    return {
      id: session.id,
      title: session.title,
      itineraryId: session.itinerary_id,
      messages: messages.map((row) => ({
        id: row.id,
        role: row.role === "user" ? "user" : "assistant",
        text: contentText(row.content),
        cards: row.role === "assistant" ? toolCards(row.tool_calls) : [],
        createdAt: new Date(row.created_at).toISOString(),
      })),
      proposals: proposals.flatMap((row) => {
        const proposal = proposalFromRow(row);
        return proposal ? [proposal] : [];
      }),
      remainingToday: Math.max(0, dailyLimitFor(user.is_anonymous === true) - (today?.n ?? 0)),
    };
  });
}

// Stato del chatbot per l'interfaccia: acceso, messaggi rimasti oggi, limite.
export async function chatStatus(user: DbUser): Promise<{ enabled: boolean; remainingToday: number; limit: number }> {
  const limit = dailyLimitFor(user.is_anonymous === true);
  if (!chatEnabled()) return { enabled: false, remainingToday: 0, limit };
  const [today] = await dbAsUser(user, (tx: UserTx) => tx.execute<{ n: number }>(sql`select public.chat_messages_today()::int as n`));
  return { enabled: true, remainingToday: Math.max(0, limit - (today?.n ?? 0)), limit };
}
