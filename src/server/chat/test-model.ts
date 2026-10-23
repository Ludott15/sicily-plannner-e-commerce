import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { ChatModel, ModelTurn, TurnRequest } from "./model";

// Modello di prova (CHAT_TEST_MODEL=scripted, mai su Vercel): risposte deterministiche che chiamano
// gli strumenti veri. Usato dagli e2e e dallo sviluppo locale senza chiave. Il comportamento dipende
// solo dai messaggi ricevuti:
//   "attività"  -> search_activities, poi cita i primi due id restituiti
//   "aggiungi"  -> search_activities, poi apply_itinerary_changes (add), poi conferma la proposta
//   "gusti"     -> suggest_preference_update sul mare, poi conferma la proposta
//   "errore"    -> errore del modello (api_error)
//   altro       -> risposta senza strumenti

export class ScriptedFailure extends Error {
  constructor() {
    super("scripted_failure");
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function userText(message: Anthropic.MessageParam): string | null {
  return message.role === "user" && typeof message.content === "string" ? message.content : null;
}

// Testo dell'ultima richiesta dell'utente (non i risultati degli strumenti).
function lastUserText(messages: readonly Anthropic.MessageParam[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = userText(messages[index]!);
    if (text !== null) return text;
  }
  return "";
}

// Round degli strumenti di questo turno: messaggi assistant dopo l'ultima richiesta dell'utente.
function roundsThisTurn(messages: readonly Anthropic.MessageParam[]): number {
  let rounds = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (userText(message) !== null) break;
    if (message.role === "assistant") rounds += 1;
  }
  return rounds;
}

// Id che compaiono nei risultati dell'ultimo giro di strumenti.
function lastToolIds(messages: readonly Anthropic.MessageParam[]): string[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "user" || typeof message.content === "string") continue;
    const ids: string[] = [];
    for (const block of message.content) {
      if (block.type !== "tool_result") continue;
      const content = typeof block.content === "string" ? block.content : "";
      ids.push(...(content.match(UUID) ?? []));
    }
    return [...new Set(ids)];
  }
  return [];
}

type Plan = { kind: "text"; text: string } | { kind: "tool"; name: "search_activities" | "apply_itinerary_changes" | "suggest_preference_update"; input: Record<string, unknown> };

function planFor(messages: readonly Anthropic.MessageParam[]): Plan {
  const request = lastUserText(messages);
  const round = roundsThisTurn(messages);
  const ids = lastToolIds(messages);
  if (/errore|error/i.test(request)) throw new ScriptedFailure();

  if (/aggiung|add/i.test(request)) {
    if (round === 0) return { kind: "tool", name: "search_activities", input: { limit: 1 } };
    if (round === 1) {
      const first = ids[0];
      if (!first) return { kind: "text", text: "Nel catalogo non trovo attività da aggiungere." };
      return { kind: "tool", name: "apply_itinerary_changes", input: { changes: [{ op: "add", activityId: first, dayIndex: 0 }] } };
    }
    const added = ids[0];
    return {
      kind: "text",
      text: added
        ? `Ho preparato una proposta: aggiungo [[activity:${added}]] al primo giorno. Accettala per applicarla.`
        : "Ho preparato una proposta. Accettala per applicarla.",
    };
  }

  if (/attivit|attività|activit/i.test(request)) {
    if (round === 0) return { kind: "tool", name: "search_activities", input: { limit: 2 } };
    const cited = ids.slice(0, 2).map((id) => `[[activity:${id}]]`);
    return {
      kind: "text",
      text: cited.length > 0 ? `Ecco due attività del catalogo:\n\n${cited.join("\n\n")}` : "Nel catalogo non trovo attività per questa richiesta.",
    };
  }

  if (/gusti|preferenz|taste/i.test(request)) {
    if (round === 0) {
      return { kind: "tool", name: "suggest_preference_update", input: { interestKey: "sea", weight: 4, reason: "Hai chiesto più mare." } };
    }
    return { kind: "text", text: "Ho proposto di alzare il peso del mare nei gusti. Accettala per applicarla." };
  }

  return { kind: "text", text: "Posso aiutarti a scegliere attività o a organizzare il viaggio in Sicilia." };
}

const USAGE = { inputTokens: 100, outputTokens: 20 };

export const scriptedModel: ChatModel = {
  async turn(request: TurnRequest, onText: (delta: string) => void): Promise<ModelTurn> {
    const plan = planFor(request.messages);
    if (plan.kind === "text") {
      if (plan.text) onText(plan.text);
      return {
        content: [{ type: "text", text: plan.text }],
        text: plan.text,
        toolUses: [],
        stopReason: "end_turn",
        ...USAGE,
      };
    }
    const id = `toolu_scripted_${roundsThisTurn(request.messages)}`;
    return {
      content: [{ type: "tool_use", id, name: plan.name, input: plan.input }],
      text: "",
      toolUses: [{ id, name: plan.name, input: plan.input }],
      stopReason: "tool_use",
      ...USAGE,
    };
  },

  async short({ system }) {
    const text = system.includes("titolo") ? "Titolo di prova" : "Riassunto di prova della conversazione.";
    return { text, ...USAGE };
  },
};
