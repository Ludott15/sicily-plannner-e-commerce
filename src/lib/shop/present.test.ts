import { describe, expect, it } from "vitest";
import { centsFromEurInput, eurDecimalFromCents, eurInputFromCents, formatCents, productImageUrl } from "./present";
import type { CoverMedia } from "@/lib/media";

function cover(overrides: Partial<CoverMedia> = {}): CoverMedia {
  return {
    id: "0f1e2d3c4b5a69788796a5b4c3d2e1f0",
    storagePath: "0f1e2d3c4b5a69788796a5b4c3d2e1f0/v1/original.jpg",
    width: 2400,
    height: 1800,
    focalX: 0.5,
    focalY: 0.5,
    altIt: null,
    altEn: null,
    kind: "photo",
    author: null,
    authorUrl: null,
    license: null,
    licenseUrl: null,
    modified: false,
    blurDataUrl: null,
    variantsVersion: 1,
    ...overrides,
  };
}

describe("formatCents", () => {
  it("formatta in euro con la virgola in italiano", () => {
    expect(formatCents(1250, "it")).toMatch(/12,50\s€/);
  });
  it("usa il punto in inglese", () => {
    expect(formatCents(1250, "en")).toContain("12.50");
  });
});

describe("centsFromEurInput", () => {
  it.each([
    ["12,50", 1250],
    ["12.5", 1250],
    ["12", 1200],
    [" 0,99 ", 99],
  ])("converte %s in %i centesimi", (input, cents) => {
    expect(centsFromEurInput(input)).toBe(cents);
  });
  it.each(["", "abc", "12,505", "-3", "1.000,00"])("rifiuta %s", (input) => {
    expect(centsFromEurInput(input)).toBeNull();
  });
});

describe("eurInputFromCents", () => {
  it("restituisce la virgola decimale e vuoto per null", () => {
    expect(eurInputFromCents(1250)).toBe("12,50");
    expect(eurInputFromCents(null)).toBe("");
  });
  it("torna al valore di partenza con centsFromEurInput", () => {
    expect(centsFromEurInput(eurInputFromCents(4990))).toBe(4990);
  });
});

describe("eurDecimalFromCents", () => {
  it("produce il testo decimale del JSON-LD", () => {
    expect(eurDecimalFromCents(1250)).toBe("12.50");
    expect(eurDecimalFromCents(5)).toBe("0.05");
  });
});

describe("productImageUrl", () => {
  it("niente copertina, niente immagine", () => {
    expect(productImageUrl(null)).toBeNull();
  });
  it("foto senza varianti: nessuna immagine", () => {
    expect(productImageUrl(cover({ variantsVersion: 0 }))).toBeNull();
  });
  it("foto con varianti: la variante quadrata da 800 px in webp", () => {
    expect(productImageUrl(cover())).toBe(
      "/api/media/0f1e2d3c4b5a69788796a5b4c3d2e1f0/v1/1x1-800.webp",
    );
  });
  it("illustrazione SVG: il file così com'è", () => {
    expect(productImageUrl(cover({ kind: "illustration", storagePath: "illustrazioni/olio.svg" }))).toBe(
      "/api/media/illustrazioni/olio.svg",
    );
  });
});
