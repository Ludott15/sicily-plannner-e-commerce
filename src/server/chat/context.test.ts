import { describe, expect, it } from "vitest";
import { contentText, planContext, toolRecords, type SessionMemory, type StoredMessage } from "./context";

// Messaggi alternati, il primo dall'utente o dall'assistente, con orari crescenti.
function messages(count: number, first: "user" | "assistant" = "user"): StoredMessage[] {
  return Array.from({ length: count }, (_, index) => {
    const userTurn = (index % 2 === 0) === (first === "user");
    return {
      id: `m${index}`,
      role: userTurn ? "user" : "assistant",
      text: `messaggio ${index}`,
      createdAt: new Date(Date.UTC(2026, 9, 16, 10, 0, index)).toISOString(),
    };
  });
}

function memory(overrides: Partial<SessionMemory>): SessionMemory {
  return { summary: null, messages: [], activityIds: [], stopIds: [], priorUserMessages: 0, ...overrides };
}

const SAVED = { text: "Riassunto precedente", upTo: new Date(Date.UTC(2026, 9, 16, 9, 0, 0)).toISOString() };

describe("planContext", () => {
  it("con 20 messaggi manda tutta la cronologia senza riassunto", () => {
    const plan = planContext(memory({ messages: messages(20) }));
    expect(plan.summarize).toBeNull();
    expect(plan.summary).toBeNull();
    expect(plan.history).toHaveLength(20);
    expect(plan.history[0]?.role).toBe("user");
  });

  it("con 21 messaggi riassume il primo e tiene gli ultimi 20", () => {
    const all = messages(21);
    const plan = planContext(memory({ messages: all }));
    expect(plan.summarize?.messages.map((m) => m.id)).toEqual(["m0"]);
    expect(plan.summarize?.upTo).toBe(all[0]?.createdAt);
    // Gli ultimi 20 partono da un messaggio assistente: il contesto comincia dall'utente, quindi 19.
    expect(plan.history).toHaveLength(19);
    expect(plan.history[0]?.content).toBe("messaggio 2");
  });

  it("non rigenera il riassunto finché i messaggi non riassunti non superano 20", () => {
    const plan = planContext(memory({ summary: SAVED, messages: messages(20) }));
    expect(plan.summarize).toBeNull();
    expect(plan.summary).toBe("Riassunto precedente");
    expect(plan.history).toHaveLength(20);
  });

  it("con un riassunto e più di 20 messaggi nuovi passa il riassunto precedente da aggiornare", () => {
    const plan = planContext(memory({ summary: SAVED, messages: messages(25) }));
    expect(plan.summarize?.previous).toBe("Riassunto precedente");
    expect(plan.summarize?.messages).toHaveLength(5);
    expect(plan.history).toHaveLength(19);
  });

  it("il contesto inizia sempre con un messaggio dell'utente", () => {
    const plan = planContext(memory({ messages: messages(21, "assistant") }));
    expect(plan.history[0]?.role).toBe("user");
  });
});

describe("contentText e toolRecords", () => {
  it("legge il testo dal formato { kind, text } e dalla stringa", () => {
    expect(contentText({ kind: "text", text: "ciao" })).toBe("ciao");
    expect(contentText("vecchio")).toBe("vecchio");
    expect(contentText(null)).toBe("");
  });

  it("scarta i record malformati", () => {
    expect(toolRecords({ tools: [{ name: "search_activities", activityIds: ["a", 3], stopIds: [] }, 5] })).toEqual([
      { name: "search_activities", activityIds: ["a"], stopIds: [] },
    ]);
    expect(toolRecords("nope")).toEqual([]);
  });
});
