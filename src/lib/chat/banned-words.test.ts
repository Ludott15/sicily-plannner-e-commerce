import { describe, expect, it } from "vitest";
import { findBannedContent, hasBannedContent } from "./banned-words";

describe("findBannedContent", () => {
  it("accetta un testo sobrio", () => {
    expect(findBannedContent("Da Noto a Modica ci sono 40 minuti di auto. Costa da 35 €.")).toEqual([]);
  });

  it("trova le parole vietate intere, senza distinzione di maiuscole", () => {
    expect(hasBannedContent("Un borgo Magico.")).toBe(true);
    expect(hasBannedContent("Una perla nascosta")).toBe(true);
    expect(hasBannedContent("Un posto autentico")).toBe(true);
  });

  it("non segnala parole che solo iniziano come una forma vietata", () => {
    expect(hasBannedContent("Il magazzino è aperto")).toBe(false);
    expect(hasBannedContent("Perlustrazione del centro")).toBe(false);
  });

  it("trova la frase 'da non perdere'", () => {
    expect(findBannedContent("Un museo da non perdere.")).toEqual([{ kind: "phrase", match: "da non perdere" }]);
  });

  it("trova punti esclamativi multipli ed emoji", () => {
    expect(findBannedContent("Bello!!").map((f) => f.kind)).toEqual(["multiple_exclamation"]);
    expect(findBannedContent("Bello 🎉").map((f) => f.kind)).toEqual(["emoji"]);
    expect(hasBannedContent("Bello!")).toBe(false);
  });
});
