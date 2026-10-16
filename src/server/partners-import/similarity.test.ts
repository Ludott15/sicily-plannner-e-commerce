import { describe, expect, it } from "vitest";
import { NAME_MATCH_MIN, nameSimilarity, normalizeName } from "./similarity";

describe("normalizeName", () => {
  it("toglie accenti, punteggiatura e parole vuote italiane e inglesi", () => {
    expect(normalizeName("Escursione all'Etna, il tramonto!")).toEqual(["escursione", "all", "etna", "tramonto"]);
    expect(normalizeName("Tour of the Valley")).toEqual(["tour", "valley"]);
    expect(normalizeName("Città di Modica")).toEqual(["citta", "modica"]);
  });
});

describe("nameSimilarity", () => {
  it("vale 1 per nomi uguali anche con maiuscole, accenti e ordine diverso", () => {
    expect(nameSimilarity("Escursione Etna al tramonto", "escursione etna tramonto")).toBe(1);
    expect(nameSimilarity("Città di Modica", "Citta Modica")).toBe(1);
    expect(nameSimilarity("Etna al tramonto escursione", "Escursione Etna al tramonto")).toBe(1);
  });

  it("è simmetrica", () => {
    const a = "Degustazione di vini a Marsala";
    const b = "Vini di Marsala con degustazione";
    expect(nameSimilarity(a, b)).toBe(nameSimilarity(b, a));
  });

  it("supera la soglia per nomi dello stesso tour e resta sotto per nomi diversi", () => {
    expect(nameSimilarity("Escursione Etna al tramonto", "Escursione all'Etna al tramonto in jeep")).toBeGreaterThanOrEqual(
      NAME_MATCH_MIN,
    );
    expect(nameSimilarity("Degustazione vini", "Museo archeologico")).toBeLessThan(NAME_MATCH_MIN);
  });

  it("vale 0 se un nome non ha token utili", () => {
    expect(nameSimilarity("il di la", "Etna")).toBe(0);
    expect(nameSimilarity("", "")).toBe(0);
  });
});
