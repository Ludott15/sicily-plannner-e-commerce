import { describe, expect, it } from "vitest";
import { groupSessionsByAge, type ChatSessionListItem } from "./group-sessions";

// Date costruite in ora locale: il test non dipende dal fuso della macchina.
const now = new Date(2026, 9, 20, 15, 0);
const at = (year: number, month: number, day: number, hour = 9) => new Date(year, month, day, hour).toISOString();

function session(id: string, updatedAt: string): ChatSessionListItem {
  return { id, title: id, updatedAt };
}

describe("groupSessionsByAge", () => {
  it("separa oggi, gli ultimi sette giorni e il resto, nell'ordine ricevuto", () => {
    const sessions = [
      session("oggi-1", at(2026, 9, 20, 14)),
      session("oggi-2", at(2026, 9, 20, 0)),
      session("ieri", at(2026, 9, 19, 23)),
      session("sei-giorni-fa", at(2026, 9, 14, 0)),
      session("sette-giorni-fa", at(2026, 9, 13, 23)),
      session("vecchia", at(2026, 8, 1)),
    ];

    const groups = groupSessionsByAge(sessions, now);

    expect(groups.map((group) => group.key)).toEqual(["today", "week", "older"]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["oggi-1", "oggi-2"]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual(["ieri", "sei-giorni-fa"]);
    expect(groups[2]?.items.map((item) => item.id)).toEqual(["sette-giorni-fa", "vecchia"]);
  });

  it("omette i gruppi vuoti", () => {
    const groups = groupSessionsByAge([session("solo-oggi", at(2026, 9, 20, 8))], now);
    expect(groups.map((group) => group.key)).toEqual(["today"]);
  });

  it("non produce gruppi per un elenco vuoto", () => {
    expect(groupSessionsByAge([], now)).toEqual([]);
  });

  it("mette in Prima una data non valida invece di perdere la conversazione", () => {
    const groups = groupSessionsByAge([session("rotta", "non-una-data")], now);
    expect(groups).toEqual([{ key: "older", items: [session("rotta", "non-una-data")] }]);
  });
});
