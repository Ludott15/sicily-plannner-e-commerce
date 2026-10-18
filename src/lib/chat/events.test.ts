import { describe, expect, it } from "vitest";
import { activityRefIds, parseActivityRefs } from "./events";

const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const OTHER = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";

describe("parseActivityRefs", () => {
  it("separa testo e riferimenti nell'ordine di comparsa", () => {
    const { segments } = parseActivityRefs(`Vai a [[activity:${ID}]] e poi a [[activity:${OTHER}]].`);
    expect(segments).toEqual([
      { kind: "text", text: "Vai a " },
      { kind: "activity", id: ID },
      { kind: "text", text: " e poi a " },
      { kind: "activity", id: OTHER },
      { kind: "text", text: "." },
    ]);
  });

  it("gestisce testo senza riferimenti, riferimento in apertura e stringa vuota", () => {
    expect(parseActivityRefs("solo testo").segments).toEqual([{ kind: "text", text: "solo testo" }]);
    expect(parseActivityRefs(`[[activity:${ID}]]`).segments).toEqual([{ kind: "activity", id: ID }]);
    expect(parseActivityRefs("").segments).toEqual([]);
  });

  it("non riconosce marcatori con id non valido, che restano testo", () => {
    expect(parseActivityRefs("[[activity:non-un-id]]").segments).toEqual([{ kind: "text", text: "[[activity:non-un-id]]" }]);
  });

  it("normalizza l'id in minuscolo", () => {
    expect(parseActivityRefs(`[[activity:${ID.toUpperCase()}]]`).segments).toEqual([{ kind: "activity", id: ID }]);
  });
});

describe("activityRefIds", () => {
  it("restituisce gli id senza ripetizioni", () => {
    expect(activityRefIds(`[[activity:${ID}]] [[activity:${OTHER}]] [[activity:${ID}]]`)).toEqual([ID, OTHER]);
  });
});
