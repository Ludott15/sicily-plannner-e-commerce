import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { scriptedModel, ScriptedFailure } from "./test-model";

const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function request(text: string, extra: Anthropic.MessageParam[] = []) {
  return { system: "", dynamicSystem: "", tools: [], messages: [{ role: "user" as const, content: text }, ...extra] };
}

function toolResult(content: string): Anthropic.MessageParam {
  return { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_scripted_0", content }] };
}

const AFTER_TOOL: Anthropic.MessageParam = { role: "assistant", content: "..." };

describe("modello di prova", () => {
  it("chiama search_activities alla prima richiesta di attività", async () => {
    const turn = await scriptedModel.turn(request("Quali attività ci sono?"), () => {});
    expect(turn.toolUses.map((use) => use.name)).toEqual(["search_activities"]);
    expect(turn.stopReason).toBe("tool_use");
  });

  it("cita i primi id restituiti dallo strumento", async () => {
    const turn = await scriptedModel.turn(
      request("Quali attività ci sono?", [AFTER_TOOL, toolResult(`<dati_catalogo>{"id":"${ID}"}</dati_catalogo>`)]),
      () => {},
    );
    expect(turn.text).toContain(`[[activity:${ID}]]`);
    expect(turn.toolUses).toEqual([]);
  });

  it("propone la modifica con apply_itinerary_changes dopo la ricerca", async () => {
    const turn = await scriptedModel.turn(
      request("Aggiungi un'attività", [AFTER_TOOL, toolResult(`{"id":"${ID}"}`)]),
      () => {},
    );
    expect(turn.toolUses[0]?.name).toBe("apply_itinerary_changes");
    expect(turn.toolUses[0]?.input).toEqual({ changes: [{ op: "add", activityId: ID, dayIndex: 0 }] });
  });

  it("simula un errore del modello con 'errore'", async () => {
    await expect(scriptedModel.turn(request("c'è un errore"), () => {})).rejects.toBeInstanceOf(ScriptedFailure);
  });

  it("invia il testo al client in un solo delta", async () => {
    const deltas: string[] = [];
    const turn = await scriptedModel.turn(request("ciao"), (delta) => deltas.push(delta));
    expect(deltas.join("")).toBe(turn.text);
  });

  it("titolo e riassunto sono deterministici", async () => {
    expect((await scriptedModel.short({ system: "Scrivi un titolo", user: "x", maxTokens: 40 })).text).toBe("Titolo di prova");
    expect((await scriptedModel.short({ system: "Riassumi", user: "x", maxTokens: 400 })).text).toContain("Riassunto");
  });
});
