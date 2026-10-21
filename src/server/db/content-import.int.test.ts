import { afterAll, describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { applyCatalog, parseCatalog, readCatalogFiles } from "../../../scripts/content/import-catalog.mjs";

// Import dei contenuti (scripts/content/import-catalog.mjs) sul database di test. Non dipende dal seed:
// crea luoghi, attività e un itinerario con prefisso int-, usa i testi veri del catalogo del repo, e
// annulla tutto con una transazione. L'import è idempotente e disattiva i consigli tolti dal file.

const CATALOG = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "content", "catalog");
const url = process.env.DATABASE_URL;
const sql = postgres(url ?? "", { prepare: false, max: 1, onnotice: () => {} });
const TODAY = "2026-10-20";

class Rollback extends Error {}

// Il catalogo del repo, con i primi elementi di ciascun tipo rinominati int-: il database di test
// riceve slug int-palermo, int-duomo-monreale e int-weekend-palermo.
function testCatalog() {
  const files = readCatalogFiles(CATALOG);
  return parseCatalog({
    luoghi: files.luoghi.slice(0, 1),
    attivita: files.attivita.slice(0, 1),
    itinerari: files.itinerari.slice(0, 1),
  });
}

// Righe di prova con slug int- derivati dal catalogo: il primo luogo, la prima attività, il primo itinerario.
async function seedTestRows(tx: postgres.TransactionSql, catalog: ReturnType<typeof testCatalog>) {
  const place = catalog.places[0];
  const activity = catalog.activities[0];
  const itinerary = catalog.itineraries[0];
  await tx`
    insert into public.places (slug, name, province, lat, lng)
    values (${`int-${place.slug}`}, 'Luogo di prova', 'PA', 38.1157, 13.3615)`;
  const [row] = await tx`select id from public.places where slug = ${`int-${place.slug}`}`;
  if (!row) throw new Error("luogo di prova non creato");
  await tx`
    insert into public.activities (slug, place_id, title, duration_min, is_active)
    values (${`int-${activity.slug}`}, ${row.id}, 'Attività di prova', 60, false)`;
  await tx`
    insert into public.itineraries (title, slug, is_template, days)
    values ('Itinerario di prova', ${`int-${itinerary.slug}`}, true, ${itinerary.dayIntros.length})`;
}

async function countTips(tx: postgres.TransactionSql) {
  const [row] = await tx`select count(*)::int as n from public.local_tips where is_active`;
  if (!row) throw new Error("conteggio dei consigli non disponibile");
  return Number(row.n);
}

type Run = { counts: Record<string, unknown>; active: number };

describe("import dei contenuti", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("aggiorna le righe per slug, è idempotente e disattiva i consigli tolti dal file", async () => {
    const catalog = testCatalog();
    const runs: Run[] = [];
    await expect(
      sql.begin(async (tx) => {
        await seedTestRows(tx, catalog);
        const first = await applyCatalog(tx, catalog, { prefix: "int-", verifiedAt: TODAY });
        runs.push({ counts: first, active: await countTips(tx) });
        const second = await applyCatalog(tx, catalog, { prefix: "int-", verifiedAt: TODAY });
        runs.push({ counts: second, active: await countTips(tx) });

        // Un consiglio tolto dal file: disattivato al passaggio successivo.
        const reduced = structuredClone(catalog);
        reduced.activities[0].consigli = [reduced.activities[0].consigli[0]];
        const third = await applyCatalog(tx, reduced, { prefix: "int-", verifiedAt: TODAY });
        runs.push({ counts: third, active: await countTips(tx) });

        const [place] = await tx`select description, tagline_it from public.places where slug = ${`int-${catalog.places[0].slug}`}`;
        if (!place) throw new Error("luogo di prova scomparso");
        expect(place.description).toBe(catalog.places[0].descriptionIt);
        expect(place.tagline_it).toBe(catalog.places[0].taglineIt);
        throw new Rollback("annullata");
      }),
    ).rejects.toBeInstanceOf(Rollback);

    expect(runs).toHaveLength(3);
    const [first, second, third] = runs as [Run, Run, Run];
    expect(first.counts).toMatchObject({ places: { updated: 1, missing: [] }, activities: { updated: 1 } });
    expect(second.counts).toMatchObject({ tips: { inserted: 0, reactivated: 0, deactivated: 0 } });
    expect(second.active).toBe(first.active);
    expect(third.counts).toMatchObject({ tips: { deactivated: 1 } });
    expect(third.active).toBe(first.active - 1);
  });

  it("rifiuta un itinerario con un numero di giorni diverso dal database", async () => {
    const catalog = testCatalog();
    await expect(
      sql.begin(async (tx) => {
        await seedTestRows(tx, { ...catalog, itineraries: [{ ...catalog.itineraries[0], dayIntros: [...catalog.itineraries[0].dayIntros, "Giorno in più."] }] });
        await applyCatalog(tx, catalog, { prefix: "int-", verifiedAt: TODAY });
        throw new Rollback("non dovrebbe arrivare qui");
      }),
    ).rejects.toThrow("giorni nel database");
  });
});
