import { describe, expect, it } from "vitest";
import { isGuideFile, isLocalDatabase, parseGuideSource, planGuideImport } from "./import-guides.mjs";

describe("isGuideFile", () => {
  it("considera guide solo i file con nome in minuscolo, e non FONTI.md", () => {
    expect(isGuideFile("cosa-mangiare-in-sicilia.md")).toBe(true);
    expect(isGuideFile("FONTI.md")).toBe(false);
    expect(isGuideFile("fonti.md.bak")).toBe(false);
    expect(isGuideFile("Guida.md")).toBe(false);
  });
});

const source = [
  "---",
  "slug: cosa-mangiare",
  "title: Cosa mangiare in Sicilia",
  "summary: Piatti e dove trovarli.",
  "author: Redazione di Isula",
  "links:",
  "  - place: palermo",
  "  - place: noto",
  "---",
  "",
  "Testo della guida.",
].join("\n");

describe("parseGuideSource", () => {
  it("legge slug, titolo, riassunto, autore, corpo e luoghi collegati", () => {
    const guide = parseGuideSource(source, "cosa-mangiare.md");
    expect(guide).toEqual({
      slug: "cosa-mangiare",
      title: "Cosa mangiare in Sicilia",
      summary: "Piatti e dove trovarli.",
      author: "Redazione di Isula",
      body: "Testo della guida.\n",
      places: ["palermo", "noto"],
    });
  });

  it("rifiuta uno slug diverso dal nome del file e uno slug non valido", () => {
    expect(() => parseGuideSource(source, "altro.md")).toThrow("non coincide");
    expect(() => parseGuideSource(source.replace("cosa-mangiare", "Cosa_Mangiare"), "Cosa_Mangiare.md")).toThrow("non valido");
  });

  it("rifiuta un collegamento che non sia a un luogo, e il titolo mancante", () => {
    expect(() => parseGuideSource(source.replace("  - place: noto", "  - activity: noto"), "cosa-mangiare.md")).toThrow(
      "link non supportato",
    );
    expect(() => parseGuideSource(source.replace("title: Cosa mangiare in Sicilia\n", ""), "cosa-mangiare.md")).toThrow(
      'manca "title"',
    );
  });

  it("rifiuta un riassunto troppo lungo e un corpo vuoto", () => {
    expect(() => parseGuideSource(source.replace("Piatti e dove trovarli.", "x".repeat(301)), "cosa-mangiare.md")).toThrow(
      "supera 300",
    );
    expect(() => parseGuideSource(source.replace("Testo della guida.", "   "), "cosa-mangiare.md")).toThrow("corpo è vuoto");
  });
});

describe("planGuideImport", () => {
  const guide = parseGuideSource(source, "cosa-mangiare.md");

  it("risolve i luoghi esistenti con la posizione e salta quelli mancanti", () => {
    const plan = planGuideImport([guide], new Map([["palermo", "id-palermo"]]));
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0]?.links).toEqual([{ placeId: "id-palermo", position: 0 }]);
    expect(plan.skipped).toEqual([{ guide: "cosa-mangiare", place: "noto" }]);
  });

  it("mantiene l'ordine dei luoghi come nel file", () => {
    const plan = planGuideImport(
      [guide],
      new Map([
        ["palermo", "id-palermo"],
        ["noto", "id-noto"],
      ]),
    );
    expect(plan.upserts[0]?.links).toEqual([
      { placeId: "id-palermo", position: 0 },
      { placeId: "id-noto", position: 1 },
    ]);
    expect(plan.skipped).toEqual([]);
  });
});

describe("isLocalDatabase", () => {
  it("riconosce gli host locali e non locali", () => {
    expect(isLocalDatabase("postgresql://postgres:postgres@127.0.0.1:55322/postgres")).toBe(true);
    expect(isLocalDatabase("postgresql://u:p@localhost:5432/db")).toBe(true);
    expect(isLocalDatabase("postgresql://u:p@aws-0-eu.pooler.supabase.com:6543/postgres")).toBe(false);
  });
});
