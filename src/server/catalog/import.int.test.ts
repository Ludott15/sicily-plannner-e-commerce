import { randomUUID } from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATALOG_IMPORT_COLUMNS, type CatalogImportColumn } from "@/lib/catalog-import/columns";
import { dbAdmin } from "@/server/db/admin";
import {
  activities,
  activityInterests,
  activitySources,
  adminAuditLog,
  areas,
  media,
  places,
  profiles,
} from "@/server/db/schema";
import { buildCatalogImportPreview, commitCatalogImport, type CatalogImportOutcome } from "./import.admin";

// Importazione CSV del catalogo su Postgres locale: anteprima, conferma, idempotenza, tag,
// immagini, registro e vincoli di attivazione. Tutto ha il prefisso int-: la pulizia globale
// rimuove i residui. Non si chiama la server action (requireAdmin legge i cookie): si chiamano
// le funzioni del modulo import.admin.ts, come farebbe l'azione dopo requireAdmin.
// closeConnection non si chiama qui: la regola ESLint vieta db/connection fuori da src/server/db.

const s = Date.now();
const id = () => randomUUID();
const slug = (name: string) => `int-${name}-${s}`;

const actor = { id: id(), email: `int-import-${s}@example.com` };
const areaId = id();
const areaSlug = slug("area");
const mediaId = id();
const mediaFileName = `int-${s}-copertina.jpg`;
const existingPlaceId = id();
const existingPlaceSlug = slug("luogo-esistente");
const activeActivitySlug = slug("att-attiva");
const activeActivityId = id();
const newPlaceSlug = slug("luogo-nuovo");
const newActivitySlug = slug("att-nuova");
const errorActivitySlug = slug("att-errore");
const otherNewPlaceSlug = slug("luogo-altro");

type CsvRow = Partial<Record<CatalogImportColumn, string>>;

// Riga valida di base: luogo nuovo nell'area di prova, un tag, nessuna fonte.
const baseRow = (overrides: CsvRow = {}): CsvRow => ({
  slug: newActivitySlug,
  name_it: "int- Attivita nuova",
  place_slug: newPlaceSlug,
  place_name: "int- Luogo nuovo",
  place_province: "SR",
  place_lat: "37.07",
  place_lng: "15.29",
  area_slug: areaSlug,
  place_tagline_it: "Una frase breve",
  description_it: "Descrizione di prova",
  duration_min: "90",
  interests: "sea:2",
  ...overrides,
});

// Riga con un errore di durata: va scartata e contata.
const errorRow = (): CsvRow => baseRow({ slug: errorActivitySlug, duration_min: "abc" });

function csvOf(rows: CsvRow[]): string {
  const lines = [CATALOG_IMPORT_COLUMNS.join(","), ...rows.map((r) => CATALOG_IMPORT_COLUMNS.map((c) => r[c] ?? "").join(","))];
  return `${lines.join("\r\n")}\r\n`;
}

const preview = (text: string, fileName = "int.csv") =>
  dbAdmin.transaction((tx) => buildCatalogImportPreview(tx, fileName, text));
const commit = (text: string, fileName = "int.csv") =>
  dbAdmin.transaction((tx) => commitCatalogImport(tx, actor.id, fileName, text));

function expectPreview(outcome: CatalogImportOutcome) {
  if (outcome.status !== "preview") throw new Error(`atteso preview, ottenuto ${outcome.status}`);
  return outcome.preview;
}

function expectImported(outcome: CatalogImportOutcome) {
  if (outcome.status !== "imported") throw new Error(`attesa importazione, ottenuto ${outcome.status}`);
  return outcome.result;
}

beforeAll(async () => {
  // Il trigger on_auth_user_created crea il profilo: lo si promuove ad admin per il registro.
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, raw_user_meta_data)
    values (${actor.id}, ${actor.email}, '{"full_name": "Import int"}')
  `);
  await dbAdmin.update(profiles).set({ role: "admin" }).where(eq(profiles.id, actor.id));

  await dbAdmin.transaction(async (tx) => {
    await tx.insert(areas).values({ id: areaId, slug: areaSlug, nameIt: "Area int", nameEn: "Area int", sort: 990 });
    await tx.insert(media).values({
      id: mediaId,
      storagePath: `${mediaId}/master.jpg`,
      width: 2000,
      height: 1500,
      kind: "photo",
      sourceType: "own",
      altIt: "int- foto",
      author: "Autore int",
      license: "CC0 1.0",
      variantsVersion: 1,
      originalFilename: mediaFileName,
    });
    await tx.insert(places).values({
      id: existingPlaceId,
      slug: existingPlaceSlug,
      name: "int- Luogo esistente",
      province: "SR",
      lat: 37,
      lng: 15,
      areaId,
      isActive: true,
    });
    await tx.insert(activities).values({
      id: activeActivityId,
      slug: activeActivitySlug,
      placeId: existingPlaceId,
      title: "int- attiva",
      durationMin: 60,
      isActive: true,
    });
    await tx.insert(activityInterests).values({ activityId: activeActivityId, interestKey: "sea", strength: 2 });
  });
});

afterAll(async () => {
  await dbAdmin.delete(activities).where(inArray(activities.slug, [newActivitySlug, errorActivitySlug, activeActivitySlug]));
  await dbAdmin.delete(places).where(inArray(places.slug, [newPlaceSlug, otherNewPlaceSlug, existingPlaceSlug]));
  await dbAdmin.delete(areas).where(eq(areas.id, areaId));
  await dbAdmin.delete(media).where(eq(media.id, mediaId));
  // Il profilo esce con l'utente: il registro resta, con actor_id null (consentito dal trigger).
  await dbAdmin.execute(sql`delete from auth.users where id = ${actor.id}`);
});

describe("anteprima", () => {
  it("classifica le righe senza scrivere nulla", async () => {
    const text = csvOf([baseRow(), errorRow()]);
    const result = expectPreview(await preview(text));

    expect(result.totals).toEqual({ create: 1, update: 0, error: 1, placesCreated: 1 });
    const invalid = result.rows.find((r) => r.slug === errorActivitySlug);
    expect(invalid?.status).toBe("error");
    expect(invalid?.errors.map((e) => e.code)).toContain("duration_invalid");

    const [activity] = await dbAdmin.select({ id: activities.id }).from(activities).where(eq(activities.slug, newActivitySlug));
    expect(activity).toBeUndefined();
  });
});

describe("conferma", () => {
  it("prima importazione: luogo nuovo inattivo da verificare, attività inattiva con tag, fonte e copertina", async () => {
    const text = csvOf([
      baseRow({
        source_url: "https://example.com/fonte",
        notes: "Nota interna",
        image_file: mediaFileName.toUpperCase(),
      }),
      errorRow(),
    ]);
    const result = expectImported(await commit(text, "prima.csv"));
    expect(result).toEqual({ created: 1, updated: 0, skipped: 1, placesCreated: 1 });

    const [place] = await dbAdmin.select().from(places).where(eq(places.slug, newPlaceSlug));
    expect(place).toMatchObject({ isActive: false, needsReview: true, taglineIt: "Una frase breve" });

    const [activity] = await dbAdmin.select().from(activities).where(eq(activities.slug, newActivitySlug));
    expect(activity).toMatchObject({ isActive: false, needsReview: true, coverMediaId: mediaId, titleEn: null });

    const tags = await dbAdmin
      .select({ key: activityInterests.interestKey, strength: activityInterests.strength })
      .from(activityInterests)
      .where(eq(activityInterests.activityId, activity!.id));
    expect(tags).toEqual([{ key: "sea", strength: 2 }]);

    const [source] = await dbAdmin
      .select({ sourceUrl: activitySources.sourceUrl, notes: activitySources.notes })
      .from(activitySources)
      .where(eq(activitySources.activityId, activity!.id));
    expect(source).toEqual({ sourceUrl: "https://example.com/fonte", notes: "Nota interna" });

    const [scartata] = await dbAdmin.select({ id: activities.id }).from(activities).where(eq(activities.slug, errorActivitySlug));
    expect(scartata).toBeUndefined();
  });

  it("seconda importazione dello stesso file: solo aggiornamenti, nessun duplicato", async () => {
    const text = csvOf([baseRow({ image_file: mediaFileName, source_url: "https://example.com/fonte", notes: "Nota interna" }), errorRow()]);
    const result = expectImported(await commit(text, "seconda.csv"));
    expect(result).toEqual({ created: 0, updated: 1, skipped: 1, placesCreated: 0 });

    const rows = await dbAdmin.select({ id: activities.id, isActive: activities.isActive, needsReview: activities.needsReview }).from(activities).where(eq(activities.slug, newActivitySlug));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ isActive: false, needsReview: true });
  });

  it("interessi con altra forza sostituiscono i tag; interessi vuoti li lasciano", async () => {
    const activity = await dbAdmin.select({ id: activities.id }).from(activities).where(eq(activities.slug, newActivitySlug));
    const activityId = activity[0]!.id;

    expectImported(await commit(csvOf([baseRow({ interests: "sea:3" })]), "tag.csv"));
    const replaced = await dbAdmin
      .select({ key: activityInterests.interestKey, strength: activityInterests.strength })
      .from(activityInterests)
      .where(eq(activityInterests.activityId, activityId));
    expect(replaced).toEqual([{ key: "sea", strength: 3 }]);

    expectImported(await commit(csvOf([baseRow({ interests: "" })]), "tag-vuoti.csv"));
    const kept = await dbAdmin
      .select({ strength: activityInterests.strength })
      .from(activityInterests)
      .where(eq(activityInterests.activityId, activityId));
    expect(kept).toEqual([{ strength: 3 }]);
  });

  it("attività attiva: resta attiva, torna da verificare e il luogo esistente non cambia", async () => {
    const text = csvOf([baseRow({ slug: activeActivitySlug, place_slug: existingPlaceSlug, place_name: "int- Altro nome", interests: "" })]);
    const previewResult = expectPreview(await preview(text));
    const [row] = previewResult.rows;
    expect(row).toMatchObject({ status: "update", activeNow: true, createsPlace: false });
    expect(row?.warnings.map((w) => w.code)).toContain("place_data_ignored");

    expectImported(await commit(text, "attiva.csv"));
    const [activity] = await dbAdmin
      .select({ isActive: activities.isActive, needsReview: activities.needsReview, placeId: activities.placeId })
      .from(activities)
      .where(eq(activities.id, activeActivityId));
    expect(activity).toEqual({ isActive: true, needsReview: true, placeId: existingPlaceId });
    const [place] = await dbAdmin.select({ name: places.name }).from(places).where(eq(places.id, existingPlaceId));
    expect(place?.name).toBe("int- Luogo esistente");
  });

  it("attiva con luogo nuovo: errore place_inactive_for_active e nessuna scrittura", async () => {
    const text = csvOf([
      baseRow({ slug: activeActivitySlug, place_slug: otherNewPlaceSlug, place_name: "int- Luogo altro" }),
    ]);
    const result = expectPreview(await preview(text));
    expect(result.rows[0]?.status).toBe("error");
    expect(result.rows[0]?.errors.map((e) => e.code)).toContain("place_inactive_for_active");

    const outcome = await commit(text, "errore-attiva.csv");
    expect(outcome.status).toBe("preview");

    const [activity] = await dbAdmin.select({ placeId: activities.placeId }).from(activities).where(eq(activities.id, activeActivityId));
    expect(activity?.placeId).toBe(existingPlaceId);
    const [other] = await dbAdmin.select({ id: places.id }).from(places).where(eq(places.slug, otherNewPlaceSlug));
    expect(other).toBeUndefined();
  });

  it("riga scartata non crea il suo luogo nuovo; note senza fonte non cancellano la fonte salvata", async () => {
    const text = csvOf([
      baseRow({ slug: activeActivitySlug, place_slug: otherNewPlaceSlug, place_name: "int- Luogo altro" }),
      baseRow({ notes: "Nota aggiornata" }),
    ]);
    const result = expectImported(await commit(text, "misto.csv"));
    expect(result).toEqual({ created: 0, updated: 1, skipped: 1, placesCreated: 0 });

    const [other] = await dbAdmin.select({ id: places.id }).from(places).where(eq(places.slug, otherNewPlaceSlug));
    expect(other).toBeUndefined();

    const [source] = await dbAdmin
      .select({ sourceUrl: activitySources.sourceUrl, notes: activitySources.notes })
      .from(activitySources)
      .innerJoin(activities, eq(activities.id, activitySources.activityId))
      .where(eq(activities.slug, newActivitySlug));
    expect(source).toEqual({ sourceUrl: "https://example.com/fonte", notes: "Nota aggiornata" });
  });
});

describe("registro", () => {
  it("una riga per importazione confermata, con i conteggi giusti; anteprime e rifiuti non scrivono", async () => {
    const rows = await dbAdmin
      .select({ action: adminAuditLog.action, entity: adminAuditLog.entity, entityId: adminAuditLog.entityId, diff: adminAuditLog.diff })
      .from(adminAuditLog)
      .where(eq(adminAuditLog.actorId, actor.id))
      .orderBy(asc(adminAuditLog.id));
    const imports = rows.filter((r) => r.action === "catalog.import");
    // Sei conferme (prima, seconda, due sui tag, attiva, misto): l'anteprima e il rifiuto non scrivono nel registro.
    expect(imports).toHaveLength(6);
    expect(imports.every((r) => r.entity === "activities" && r.entityId === null)).toBe(true);

    const diff = (index: number) =>
      imports[index]?.diff as {
        file: string;
        created: string[];
        updated: string[];
        skipped: { line: number; slug: string; errors: string[] }[];
        places_created: string[];
      };
    expect(diff(0)).toMatchObject({ file: "prima.csv", created: [newActivitySlug], updated: [], places_created: [newPlaceSlug] });
    expect(diff(0).skipped).toEqual([{ line: 3, slug: errorActivitySlug, errors: ["duration_invalid"] }]);
    expect(diff(1)).toMatchObject({ file: "seconda.csv", created: [], updated: [newActivitySlug], places_created: [] });
    expect(diff(4)).toMatchObject({ file: "attiva.csv", created: [], updated: [activeActivitySlug] });
    expect(diff(5)).toMatchObject({ file: "misto.csv", updated: [newActivitySlug], places_created: [] });
  });
});
