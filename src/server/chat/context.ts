import "server-only";
import { sql } from "drizzle-orm";
import type { ChatActivityCard } from "@/lib/chat/events";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";
import { CHAT_HISTORY } from "./config";

// Limiti della lettura: messaggi dopo l'ultimo riassunto e messaggi dell'assistente con strumenti.
export const MEMORY_WINDOW = 200;
export const TOOL_HISTORY = 50;

// Memoria della conversazione (passo 9.1). Il contesto inviato al modello è: system, riepilogo del
// profilo, riepilogo della parte vecchia (se c'è) e gli ultimi CHAT_HISTORY messaggi user/assistant
// (solo testo). I blocchi degli strumenti non si rimandano: i dati utili stanno già nel testo
// dell'assistente. Il riassunto è un messaggio assistant con content { kind: "summary", text, upTo }.

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

export type StoredSummary = { text: string; upTo: string };

export type ModelHistoryMessage = { role: "user" | "assistant"; content: string };

export type SessionMemory = {
  summary: StoredSummary | null;
  // Messaggi user/assistant dopo il riassunto, in ordine cronologico (esclusi i riassunti).
  messages: StoredMessage[];
  // Id restituiti dagli strumenti negli ultimi TOOL_HISTORY messaggi con strumenti (tool_calls).
  // Riferimenti più vecchi non sono più citabili: il modello li recupera con una nuova ricerca.
  activityIds: string[];
  stopIds: string[];
  // 1 se la sessione ha almeno un messaggio dell'utente (il titolo si genera alla prima richiesta).
  priorUserMessages: number;
};

export type PlannedContext = {
  // Riassunto da usare nel contesto: quello salvato, o quello appena rigenerato.
  summary: string | null;
  // Se valorizzato, la parte vecchia va riassunta e il riassunto salvato con upTo.
  summarize: { previous: string | null; messages: StoredMessage[]; upTo: string } | null;
  history: ModelHistoryMessage[];
};

// Testo di un messaggio salvato. Il contenuto è { kind, text } oppure, nei dati più vecchi, una
// stringa JSON: entrambe le forme sono accettate.
export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && "text" in content && typeof content.text === "string") return content.text;
  return "";
}

// Pura: decide cosa mandare al modello e se la parte vecchia va riassunta. Un riassunto esiste
// solo quando i messaggi non riassunti superano CHAT_HISTORY; allora la parte vecchia (tutti tranne
// gli ultimi CHAT_HISTORY) entra nel riassunto e il suo ultimo messaggio diventa upTo.
export function planContext(memory: SessionMemory, historySize = CHAT_HISTORY): PlannedContext {
  const pending = memory.messages;
  const previous = memory.summary?.text ?? null;
  let summarize: PlannedContext["summarize"] = null;
  let recent = pending;
  const summary = previous;
  if (pending.length > historySize) {
    const older = pending.slice(0, pending.length - historySize);
    recent = pending.slice(pending.length - historySize);
    const last = older[older.length - 1];
    if (last) summarize = { previous, messages: older, upTo: last.createdAt };
  }
  const history: ModelHistoryMessage[] = [];
  for (const message of recent) {
    // Il contesto inizia con un messaggio dell'utente.
    if (history.length === 0 && message.role !== "user") continue;
    history.push({ role: message.role, content: message.text });
  }
  return { summary, summarize, history };
}

// Dal database: il riassunto più recente, i messaggi dopo di lui e gli id già citabili della sessione.
export async function loadSessionMemory(user: DbUser, sessionId: string): Promise<SessionMemory> {
  return dbAsUser(user, async (tx: UserTx) => {
    const [latest] = await tx.execute<{ text: string; up_to: string; created_at: string }>(sql`
      select content->>'text' as text, content->>'upTo' as up_to, created_at
      from public.chat_messages
      where session_id = ${sessionId}::uuid and role = 'assistant' and content->>'kind' = 'summary'
      order by created_at desc limit 1`);
    const summary = latest ? { text: latest.text, upTo: latest.up_to } : null;
    // Solo la finestra utile: gli ultimi MEMORY_WINDOW messaggi dopo il riassunto, non tutta la
    // sessione. Il riassunto viene rigenerato a ogni turno oltre CHAT_HISTORY, quindi la parte non
    // riassunta resta piccola e la finestra non taglia storia ancora da riassumere.
    const rows = await tx.execute<{ id: string; role: string; content: unknown; created_at: string }>(sql`
      select id, role, content, created_at from (
        select id, role, content, created_at
        from public.chat_messages
        where session_id = ${sessionId}::uuid
          and role in ('user', 'assistant')
          and coalesce(content->>'kind', '') <> 'summary'
          and (${summary?.upTo ?? null}::timestamptz is null or created_at > ${summary?.upTo ?? null}::timestamptz)
        order by created_at desc
        limit ${MEMORY_WINDOW}
      ) recent
      order by created_at asc`);
    // Riferimenti citabili: quelli degli ultimi TOOL_HISTORY messaggi dell'assistente con strumenti.
    const tools = await tx.execute<{ tool_calls: unknown }>(sql`
      select tool_calls from (
        select tool_calls from public.chat_messages
        where session_id = ${sessionId}::uuid and role = 'assistant' and tool_calls is not null
        order by created_at desc
        limit ${TOOL_HISTORY}
      ) recent_tools`);
    // Basta sapere se esiste almeno un messaggio dell'utente: si ferma al primo.
    const [counts] = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from (
        select 1 from public.chat_messages
        where session_id = ${sessionId}::uuid and role = 'user'
        limit 1
      ) first_user`);

    const activityIds = new Set<string>();
    const stopIds = new Set<string>();
    for (const row of tools) {
      for (const record of toolRecords(row.tool_calls)) {
        record.activityIds.forEach((id) => activityIds.add(id));
        record.stopIds.forEach((id) => stopIds.add(id));
      }
    }
    return {
      summary,
      messages: rows.map((row) => ({
        id: row.id,
        role: row.role === "user" ? "user" : "assistant",
        text: contentText(row.content),
        createdAt: new Date(row.created_at).toISOString(),
      })),
      activityIds: [...activityIds],
      stopIds: [...stopIds],
      priorUserMessages: counts?.n ?? 0,
    };
  });
}

export type ToolRecord = { name: string; activityIds: string[]; stopIds: string[] };

// Lettura difensiva del campo tool_calls: { tools: [...], cards: [...] }.
export function toolRecords(value: unknown): ToolRecord[] {
  if (!value || typeof value !== "object" || !("tools" in value) || !Array.isArray(value.tools)) return [];
  const records: ToolRecord[] = [];
  for (const item of value.tools) {
    if (!item || typeof item !== "object") continue;
    const name = "name" in item && typeof item.name === "string" ? item.name : "";
    const activityIds = "activityIds" in item && Array.isArray(item.activityIds) ? item.activityIds.filter(isString) : [];
    const stopIds = "stopIds" in item && Array.isArray(item.stopIds) ? item.stopIds.filter(isString) : [];
    records.push({ name, activityIds, stopIds });
  }
  return records;
}

export function toolCards(value: unknown): ChatActivityCard[] {
  if (!value || typeof value !== "object" || !("cards" in value) || !Array.isArray(value.cards)) return [];
  return value.cards as ChatActivityCard[];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
