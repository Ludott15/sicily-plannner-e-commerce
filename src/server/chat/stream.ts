import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "drizzle-orm";
import {
  CHAT_TOOL_NAMES,
  type ChatActivityCard,
  type ChatErrorCode,
  type ChatProposal,
  type ChatStreamEvent,
  type ChatToolName,
} from "@/lib/chat/events";
import { getSavedPreferences } from "@/server/personalization/data";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";
import { CHAT_MAX_TOOL_ROUNDS, dailyLimitFor } from "./config";
import { activityCards } from "./catalog";
import { contextBlock, CHAT_STATIC_SYSTEM } from "./system-prompt";
import { CHAT_TOOL_DEFINITIONS, runChatTool, type ChatLocale, type PendingProposal, type ToolState } from "./tools";
import { citedActivityIds, sanitizeAssistantText } from "./text";
import { loadSessionMemory, planContext, type StoredSummary, type ToolRecord } from "./context";
import { chatModel, type ChatModel } from "./model";

// Un turno della chat (passo 9.1): salva il messaggio dell'utente, ciclo degli strumenti (al massimo
// CHAT_MAX_TOOL_ROUNDS giri), testo finale ripulito, scrittura dell'assistente e delle proposte in
// una sola transazione dbAsUser. Gli eventi NDJSON passano da emit; un errore diventa un evento
// "error" con un codice, mai un testo di errore del modello verso il client.

export class TurnFailure extends Error {
  constructor(readonly code: ChatErrorCode) {
    super(code);
  }
}

export function classifyChatError(error: unknown): ChatErrorCode {
  if (error instanceof TurnFailure) return error.code;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Anthropic.APIError && (error.status === 529 || error.status === 503)) return "overloaded";
  return "api_error";
}

const TITLE_SYSTEM = "Scrivi un titolo breve (massimo 6 parole) per questa conversazione sul viaggio in Sicilia. Rispondi solo con il titolo, senza virgolette.";
const SUMMARY_SYSTEM = "Riassumi la conversazione che segue in italiano, in massimo 800 caratteri: preferenze dell'utente, attività discusse, modifiche proposte o accettate. Non aggiungere nulla che non sia nel testo.";

export type TurnParams = {
  user: DbUser;
  sessionId: string;
  title: string | null;
  itineraryId: string | null;
  itineraryTitle: string | null;
  locale: ChatLocale;
  text: string;
  signal?: AbortSignal;
};

function isToolName(value: string): value is ChatToolName {
  return (CHAT_TOOL_NAMES as readonly string[]).includes(value);
}

function todayInRome(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

async function profileForContext(user: DbUser): Promise<Record<string, unknown> | null> {
  const saved = await getSavedPreferences(user);
  if (!saved?.completed) return null;
  return {
    pace: saved.pace,
    days: saved.days,
    party: saved.party,
    budgetPerDayEur: saved.budgetPerDayEur,
    car: saved.car,
    interests: Object.entries(saved.weights).map(([key, weight]) => ({ key, weight })),
  };
}

async function summarizeOlder(model: ChatModel, previous: string | null, older: { role: string; text: string }[]): Promise<string | null> {
  const transcript = older.map((message) => `${message.role === "user" ? "Utente" : "Assistente"}: ${message.text}`).join("\n");
  const user = previous ? `Riassunto precedente:\n${previous}\n\nMessaggi nuovi:\n${transcript}` : transcript;
  try {
    const result = await model.short({ system: SUMMARY_SYSTEM, user, maxTokens: 400 });
    return result.text || null;
  } catch {
    return previous;
  }
}

async function persistSummary(user: DbUser, sessionId: string, summary: StoredSummary): Promise<void> {
  const content = JSON.stringify({ kind: "summary", text: summary.text, upTo: summary.upTo });
  await dbAsUser(user, (tx: UserTx) =>
    tx.execute(sql`
      select public.append_chat_message(${sessionId}::uuid, 'assistant', ${content}::jsonb, null, null, null)`),
  );
}

async function setTitle(user: DbUser, sessionId: string, title: string): Promise<void> {
  await dbAsUser(user, (tx: UserTx) =>
    tx.execute(sql`update public.chat_sessions set title = ${title} where id = ${sessionId}::uuid`),
  );
}

async function remainingToday(user: DbUser): Promise<number> {
  const [row] = await dbAsUser(user, (tx: UserTx) =>
    tx.execute<{ n: number }>(sql`select public.chat_messages_today()::int as n`),
  );
  return Math.max(0, dailyLimitFor(user.is_anonymous === true) - (row?.n ?? 0));
}

function proposalPayload(pending: PendingProposal): Record<string, unknown> {
  return { ...pending.payload };
}

function toChatProposal(id: string, pending: PendingProposal): ChatProposal {
  if (pending.kind === "itinerary") {
    return {
      id,
      kind: "itinerary",
      itineraryId: pending.payload.itineraryId,
      changes: pending.payload.changes,
      status: "pending",
      asGroupProposal: pending.payload.asGroupProposal,
    };
  }
  return {
    id,
    kind: "preference",
    interestKey: pending.payload.interestKey,
    interestLabel: pending.payload.interestLabel,
    from: pending.payload.from,
    to: pending.payload.to,
    reason: pending.payload.reason,
    status: "pending",
  };
}

// Messaggio dell'assistente e proposte in una transazione: o entrambi o nessuno.
async function persistAssistant(
  user: DbUser,
  sessionId: string,
  content: { kind: "text"; text: string },
  toolCalls: { tools: ToolRecord[]; cards: ChatActivityCard[] },
  tokens: { input: number; output: number },
  pending: PendingProposal[],
): Promise<{ messageId: string; proposals: ChatProposal[] }> {
  return dbAsUser(user, async (tx: UserTx) => {
    const [message] = await tx.execute<{ id: string }>(sql`
      select public.append_chat_message(
        ${sessionId}::uuid, 'assistant', ${JSON.stringify(content)}::jsonb, ${JSON.stringify(toolCalls)}::jsonb,
        ${tokens.input}::int, ${tokens.output}::int) as id`);
    if (!message) throw new TurnFailure("api_error");
    const proposals: ChatProposal[] = [];
    for (const item of pending) {
      const [created] = await tx.execute<{ id: string }>(sql`
        select public.create_chat_proposal(
          ${sessionId}::uuid, ${message.id}::uuid, ${item.kind}, ${JSON.stringify(proposalPayload(item))}::jsonb) as id`);
      if (!created) throw new TurnFailure("api_error");
      proposals.push(toChatProposal(created.id, item));
    }
    return { messageId: message.id, proposals };
  });
}

async function appendUserMessage(user: DbUser, sessionId: string, text: string): Promise<void> {
  const content = JSON.stringify({ kind: "text", text });
  await dbAsUser(user, (tx: UserTx) =>
    tx.execute(sql`
      select public.append_chat_message(${sessionId}::uuid, 'user', ${content}::jsonb, null, null, null)`),
  );
}

export async function runChatTurn(params: TurnParams, emit: (event: ChatStreamEvent) => void, model: ChatModel = chatModel()): Promise<void> {
  const { user, sessionId, locale, text } = params;
  try {
    emit({ type: "session", sessionId, title: params.title });

    const memory = await loadSessionMemory(user, sessionId);
    const plan = planContext(memory);
    let summary = plan.summary;
    if (plan.summarize) {
      summary = await summarizeOlder(model, plan.summarize.previous, plan.summarize.messages);
      if (summary) await persistSummary(user, sessionId, { text: summary, upTo: plan.summarize.upTo });
    }

    await appendUserMessage(user, sessionId, text);

    const state: ToolState = {
      user,
      locale,
      itineraryId: params.itineraryId,
      knownActivityIds: new Set(memory.activityIds),
      knownStopIds: new Set(memory.stopIds),
      pending: [],
    };
    const dynamicSystem = contextBlock({
      today: todayInRome(),
      locale,
      profile: await profileForContext(user),
      itineraryTitle: params.itineraryTitle,
      summary,
    });
    const messages: Anthropic.MessageParam[] = [
      ...plan.history.map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: text },
    ];

    const records: ToolRecord[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let finalText: string | null = null;
    for (let round = 0; round <= CHAT_MAX_TOOL_ROUNDS; round += 1) {
      const turn = await model.turn(
        { system: CHAT_STATIC_SYSTEM, dynamicSystem, tools: CHAT_TOOL_DEFINITIONS, messages },
        (delta) => emit({ type: "text", delta }),
        params.signal,
      );
      inputTokens += turn.inputTokens;
      outputTokens += turn.outputTokens;
      if (turn.stopReason === "refusal") throw new TurnFailure("api_error");
      if (turn.stopReason === "max_tokens" && turn.toolUses.length > 0) throw new TurnFailure("api_error");
      if (turn.toolUses.length === 0) {
        finalText = turn.text;
        break;
      }
      if (round === CHAT_MAX_TOOL_ROUNDS) throw new TurnFailure("api_error");

      messages.push({ role: "assistant", content: turn.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of turn.toolUses) {
        if (!isToolName(use.name)) throw new TurnFailure("api_error");
        emit({ type: "tool", name: use.name, status: "start" });
        const run = await runChatTool(state, use.name, use.input);
        records.push({ name: use.name, activityIds: run.activityIds, stopIds: run.stopIds });
        emit({ type: "tool", name: use.name, status: "done" });
        results.push({ type: "tool_result", tool_use_id: use.id, content: run.result, is_error: run.isError });
      }
      messages.push({ role: "user", content: results });
    }
    if (finalText === null) throw new TurnFailure("api_error");

    const sanitized = sanitizeAssistantText(finalText, state.knownActivityIds);
    if (sanitized.text === "") throw new TurnFailure("api_error");
    const cards = await activityCards(citedActivityIds(sanitized.text, state.knownActivityIds), locale, params.itineraryId);

    const saved = await persistAssistant(
      user,
      sessionId,
      { kind: "text", text: sanitized.text },
      { tools: records, cards },
      { input: inputTokens, output: outputTokens },
      state.pending,
    );

    if (memory.priorUserMessages === 0) {
      try {
        const title = await model.short({ system: TITLE_SYSTEM, user: text, maxTokens: 40 });
        if (title.text) await setTitle(user, sessionId, title.text.slice(0, 80));
      } catch {
        // Il titolo è un extra: senza, la sessione resta con il titolo predefinito.
      }
    }

    emit({
      type: "done",
      messageId: saved.messageId,
      text: sanitized.text,
      cards,
      proposals: saved.proposals,
      remainingToday: await remainingToday(user),
    });
  } catch (error) {
    emit({ type: "error", code: classifyChatError(error) });
  }
}
