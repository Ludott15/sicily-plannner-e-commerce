// Contratto della chat (passo 9.1), puro e condiviso tra server e interfaccia: tipi degli eventi
// NDJSON di POST /api/chat, delle proposte e delle schede attività, più il parser dei riferimenti
// alle attività nel testo del modello. Nessun accesso al database né a moduli server.

export type ChatActivityCard = {
  id: string;
  slug: string;
  title: string;
  placeName: string | null;
  priceFromCents: number | null;
  durationMinutes: number | null;
  rating: number | null;
  coverUrl: string | null;
  goHref: string | null;
  partnerName: string | null;
};

export type ItineraryChange =
  | { op: "add"; activityId: string; dayIndex: number; title: string }
  | { op: "remove"; stopId: string; title: string }
  | { op: "move"; stopId: string; dayIndex: number; position: number; title: string };

export type ChatProposal =
  | {
      id: string;
      kind: "itinerary";
      itineraryId: string;
      changes: ItineraryChange[];
      status: "pending" | "accepted" | "rejected";
      asGroupProposal: boolean;
    }
  | {
      id: string;
      kind: "preference";
      interestKey: string;
      interestLabel: string;
      from: number;
      to: number;
      reason: string;
      status: "pending" | "accepted" | "rejected";
    };

export const CHAT_TOOL_NAMES = [
  "get_user_profile",
  "search_activities",
  "get_activity",
  "search_flights",
  "propose_itinerary",
  "get_itinerary",
  "apply_itinerary_changes",
  "suggest_preference_update",
  "search_products",
] as const;

export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number];

export const CHAT_ERROR_CODES = ["api_error", "rate_limited", "overloaded", "timeout"] as const;
export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

export type ChatStreamEvent =
  | { type: "session"; sessionId: string; title: string | null }
  | { type: "text"; delta: string }
  | { type: "tool"; name: ChatToolName; status: "start" | "done" }
  | {
      type: "done";
      messageId: string;
      text: string;
      cards: ChatActivityCard[];
      proposals: ChatProposal[];
      remainingToday: number;
    }
  | { type: "error"; code: ChatErrorCode };

// Riferimento a un'attività nel testo: [[activity:<uuid>]]. Il server lascia passare solo gli id
// restituiti da uno strumento della sessione; il client mostra la scheda al posto del marcatore.
const ACTIVITY_REF = /\[\[activity:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]\]/g;

export type ActivityRefSegment = { kind: "text"; text: string } | { kind: "activity"; id: string };

export function parseActivityRefs(text: string): { segments: ActivityRefSegment[] } {
  const segments: ActivityRefSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(ACTIVITY_REF)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ kind: "text", text: text.slice(last, start) });
    segments.push({ kind: "activity", id: match[1]!.toLowerCase() });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return { segments };
}

// Id di tutti i riferimenti nel testo, nell'ordine di comparsa e senza ripetizioni.
export function activityRefIds(text: string): string[] {
  const ids: string[] = [];
  for (const segment of parseActivityRefs(text).segments) {
    if (segment.kind === "activity" && !ids.includes(segment.id)) ids.push(segment.id);
  }
  return ids;
}
