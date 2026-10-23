import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog, readCatalogFiles } from "./import-catalog.mjs";

// Il seed (supabase/seed.sql) ripete i testi del catalogo (content/catalog): questo test
// controlla che non divergano. Un testo del catalogo deve comparire nel seed come letterale SQL.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const seed = readFileSync(join(ROOT, "supabase", "seed.sql"), "utf8");
const catalog = parseCatalog(readCatalogFiles(join(ROOT, "content", "catalog")));
const lit = (text: string) => `'${text.replace(/'/g, "''")}'`;

describe("seed e catalogo", () => {
  it("il seed non contiene il marcatore [DEMO] né in dati né in commenti", () => {
    expect(seed).not.toContain("[DEMO]");
  });

  it("ogni luogo del catalogo ha la sua descrizione e la sua tagline nel seed", () => {
    for (const place of catalog.places) {
      expect(seed, `descrizione di ${place.slug}`).toContain(lit(place.descriptionIt));
      expect(seed, `ID di ${place.slug}`).toContain(`('demo-${place.slug}', `);
    }
  });

  it("ogni attività del catalogo ha titolo, titolo inglese e descrizione nel seed", () => {
    for (const activity of catalog.activities) {
      expect(seed, `titolo di ${activity.slug}`).toContain(lit(activity.titleIt));
      expect(seed, `titolo inglese di ${activity.slug}`).toContain(lit(activity.titleEn));
      expect(seed, `descrizione di ${activity.slug}`).toContain(lit(activity.descriptionIt));
    }
  });

  it("ogni itinerario del catalogo ha sottotitolo, descrizione, introduzioni, note e consigli nel seed", () => {
    for (const itinerary of catalog.itineraries) {
      expect(seed, `sottotitolo di ${itinerary.slug}`).toContain(lit(itinerary.subtitleIt));
      expect(seed, `descrizione di ${itinerary.slug}`).toContain(lit(itinerary.descriptionIt));
      for (const intro of itinerary.dayIntros) expect(seed, `introduzione di ${itinerary.slug}`).toContain(lit(intro));
      for (const note of itinerary.dayNotes) expect(seed, `nota di ${itinerary.slug}`).toContain(lit(note));
      for (const tip of itinerary.tips) expect(seed, `consiglio di ${itinerary.slug}`).toContain(lit(tip));
    }
  });

  it("i consigli di luoghi e attività del seed sono quelli del catalogo", () => {
    const seedTips = [...seed.matchAll(/^\s+\((?:'demo-[^']+'|null), (?:'demo-[^']+'|null), ('(?:[^']|'')*'), -?\d+\)/gm)].map(
      (m) => m[1] ?? "",
    );
    expect(seedTips.length).toBe(5);
    const known: string[] = [
      ...catalog.places.flatMap((p: { consigli: string[] }) => p.consigli),
      ...catalog.activities.flatMap((a: { consigli: string[] }) => a.consigli),
    ];
    for (const body of seedTips) {
      const text = body.slice(1, -1).replace(/''/g, "'");
      expect(known).toContain(text);
    }
  });
});
