import type { ChatActivityCard, ChatProposal, ChatStreamEvent, ChatToolName } from "@/lib/chat/events";

// Lettura dello stream NDJSON di POST /api/chat (contratto 9.1): una riga JSON per evento.
// Le righe non valide si scartano senza interrompere lo stream, così una riga sbagliata non
// lascia il messaggio a metà.

const TOOL_NAMES: readonly ChatToolName[] = [
  "get_user_profile",
  "search_activities",
  "get_activity",
  "search_flights",
  "propose_itinerary",
  "get_itinerary",
  "apply_itinerary_changes",
  "suggest_preference_update",
  "search_products",
];

const STREAM_ERRORS = ["api_error", "rate_limited", "overloaded", "timeout"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolName(value: unknown): value is ChatToolName {
  return typeof value === "string" && (TOOL_NAMES as readonly string[]).includes(value);
}

export function parseChatEvent(line: string): ChatStreamEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string") return null;

  switch (value.type) {
    case "session":
      if (typeof value.sessionId !== "string") return null;
      return {
        type: "session",
        sessionId: value.sessionId,
        title: typeof value.title === "string" ? value.title : null,
      };
    case "text":
      return typeof value.delta === "string" ? { type: "text", delta: value.delta } : null;
    case "tool":
      if (!isToolName(value.name)) return null;
      if (value.status !== "start" && value.status !== "done") return null;
      return { type: "tool", name: value.name, status: value.status };
    case "done":
      if (
        typeof value.messageId !== "string" ||
        typeof value.text !== "string" ||
        !Array.isArray(value.cards) ||
        !Array.isArray(value.proposals) ||
        typeof value.remainingToday !== "number"
      ) {
        return null;
      }
      return {
        type: "done",
        messageId: value.messageId,
        text: value.text,
        cards: value.cards as ChatActivityCard[],
        proposals: value.proposals as ChatProposal[],
        remainingToday: value.remainingToday,
      };
    case "error": {
      const code = (STREAM_ERRORS as readonly string[]).includes(String(value.code)) ? value.code : null;
      return code === null ? null : { type: "error", code: code as (typeof STREAM_ERRORS)[number] };
    }
    default:
      return null;
  }
}

// Legge il corpo della risposta riga per riga. Lancia l'errore di fetch (es. AbortError) se
// la lettura viene interrotta: lo gestisce chi chiama.
export async function readChatStream(body: ReadableStream<Uint8Array>, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        const event = parseChatEvent(line);
        if (event) onEvent(event);
      }
      newline = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  const rest = buffer.trim();
  if (rest) {
    const event = parseChatEvent(rest);
    if (event) onEvent(event);
  }
}
