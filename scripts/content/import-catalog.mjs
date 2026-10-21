// Importa i testi del catalogo di content/catalog/ nelle righe esistenti (passo 8.4). Aggiorna per
// slug: luoghi (description, tagline), attività (title, title_en, description), itinerari pronti
// (title, subtitle, description, day_intros, day_notes, tips). Non crea luoghi né attività che
// mancano: li riporta nel riepilogo. I consigli (consigli di luoghi e attività) diventano local_tips
// firmati "Redazione di Isula" (autore editoriale, creato se manca).
//
//   npm run content:catalog -- --dry-run                   piano: esegue tutto in una transazione annullata
//   npm run content:catalog                                scrive; chiede conferma se l'host non è locale
//   npm run content:catalog -- --yes                       come sopra, senza conferma
//   npm run content:catalog -- --slug-prefix=demo-         slug nel database = prefisso + slug del file
//   npm run content:catalog -- --verified-at=2026-10-20    data di verifica dei consigli nuovi (default: oggi, Roma)
//
// Idempotente: ogni consiglio si riconosce da target + testo. Una seconda esecuzione non inserisce nulla
// e non tocca verified_at dei consigli esistenti; i consigli editoriali dello stesso target che non sono
// più nel file vengono disattivati (is_active = false). I consigli di autori persona non si toccano.
//
// Connessione: DATABASE_URL (come import-guides.mjs; .env.local, mai sovrascritto dall'ambiente).
// Il prefisso demo- è ammesso solo verso un database locale: i dati demo non vanno in produzione.

import { config } from "dotenv";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { isLocalDatabase } from "./import-guides.mjs";

export const AUTHOR_NAME = "Redazione di Isula";
export const DEMO_PREFIX = "demo-";
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ITALIAN_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Lunghezze in caratteri (contract di docs/...: taglie dei testi pubblici).
const LIMITS = {
  placeTagline: 70,
  placeDescription: [280, 600],
  advice: [120, 260],
  activityTitle: 70,
  activityDescription: [300, 700],
  itinerarySubtitle: 90,
  itineraryDescription: [300, 700],
  dayIntro: 240,
  dayNote: 260,
  itineraryTip: 260,
};

const len = (text) => [...text].length;

// Una voce del catalogo: il file e lo slug nei messaggi d'errore. Pura.
export function parseCatalog(files) {
  const { luoghi, attivita, itinerari } = files;
  const fail = (file, slug, message) => {
    throw new Error(`${file}${slug ? ` (${slug})` : ""}: ${message}`);
  };
  const text = (file, slug, value, field, min, max) => {
    if (typeof value !== "string") fail(file, slug, `"${field}" deve essere un testo`);
    const trimmed = value.trim();
    if (trimmed.length < min) fail(file, slug, `"${field}" è vuoto`);
    if (len(trimmed) > max) fail(file, slug, `"${field}" supera ${max} caratteri (${len(trimmed)})`);
    return trimmed;
  };
  const advice = (file, slug, list, field, count) => {
    if (!Array.isArray(list)) fail(file, slug, `"${field}" deve essere una lista`);
    if (count !== undefined && list.length !== count) fail(file, slug, `"${field}" deve avere ${count} voci`);
    return list.map((item, index) => text(file, slug, item, `${field}[${index}]`, LIMITS.advice[0], LIMITS.advice[1]));
  };
  const sources = (file, slug, list) => {
    if (!Array.isArray(list) || list.length === 0 || list.length > 3) fail(file, slug, `"fonti" deve avere da 1 a 3 URL`);
    for (const url of list) {
      if (typeof url !== "string" || !/^https:\/\//.test(url)) fail(file, slug, `fonte non valida: ${String(url)}`);
    }
    return list;
  };
  const note = (file, slug, value) => {
    if (typeof value !== "string") fail(file, slug, `"note" deve essere un testo`);
    return value.trim();
  };
  const checkSlugs = (file, list) => {
    const seen = new Set();
    for (const item of list) {
      if (typeof item.slug !== "string" || !SLUG.test(item.slug)) fail(file, String(item.slug), "slug non valido");
      if (seen.has(item.slug)) fail(file, item.slug, "slug ripetuto");
      seen.add(item.slug);
    }
  };

  checkSlugs("luoghi.json", luoghi);
  checkSlugs("attivita.json", attivita);
  checkSlugs("itinerari.json", itinerari);

  const places = luoghi.map((item) => ({
    slug: item.slug,
    taglineIt: text("luoghi.json", item.slug, item.tagline_it, "tagline_it", 1, LIMITS.placeTagline),
    descriptionIt: text("luoghi.json", item.slug, item.description_it, "description_it", LIMITS.placeDescription[0], LIMITS.placeDescription[1]),
    consigli: advice("luoghi.json", item.slug, item.consigli, "consigli"),
    fonti: sources("luoghi.json", item.slug, item.fonti),
    note: note("luoghi.json", item.slug, item.note),
  }));
  for (const place of places) {
    if (place.consigli.length < 1 || place.consigli.length > 2) fail("luoghi.json", place.slug, `"consigli" deve avere da 1 a 2 voci`);
  }

  const activities = attivita.map((item) => {
    const consigli = advice("attivita.json", item.slug, item.consigli, "consigli", 2);
    return {
      slug: item.slug,
      titleIt: text("attivita.json", item.slug, item.title_it, "title_it", 1, LIMITS.activityTitle),
      titleEn: text("attivita.json", item.slug, item.title_en, "title_en", 1, LIMITS.activityTitle),
      descriptionIt: text("attivita.json", item.slug, item.description_it, "description_it", LIMITS.activityDescription[0], LIMITS.activityDescription[1]),
      consigli,
      fonti: sources("attivita.json", item.slug, item.fonti),
      note: note("attivita.json", item.slug, item.note),
    };
  });

  const itineraries = itinerari.map((item) => {
    const perDay = (field, max) => {
      if (!Array.isArray(item[field]) || item[field].length === 0) fail("itinerari.json", item.slug, `"${field}" deve avere una voce per giorno`);
      return item[field].map((value, index) => text("itinerari.json", item.slug, value, `${field}[${index}]`, 1, max));
    };
    const dayIntros = perDay("day_intros", LIMITS.dayIntro);
    const dayNotes = perDay("day_notes", LIMITS.dayNote);
    const tips = item.consigli.map((value, index) => text("itinerari.json", item.slug, value, `consigli[${index}]`, 1, LIMITS.itineraryTip));
    if (tips.length < 2 || tips.length > 3) fail("itinerari.json", item.slug, `"consigli" deve avere da 2 a 3 voci`);
    return {
      slug: item.slug,
      titleIt: text("itinerari.json", item.slug, item.title_it, "title_it", 1, 200),
      subtitleIt: text("itinerari.json", item.slug, item.subtitle_it, "subtitle_it", 1, LIMITS.itinerarySubtitle),
      descriptionIt: text("itinerari.json", item.slug, item.description_it, "description_it", LIMITS.itineraryDescription[0], LIMITS.itineraryDescription[1]),
      dayIntros,
      dayNotes,
      tips,
      fonti: sources("itinerari.json", item.slug, item.fonti),
      note: note("itinerari.json", item.slug, item.note),
    };
  });
  return { places, activities, itineraries };
}

// Il prefisso demo- è solo per un database locale. Pura.
export function checkPrefix(prefix, url) {
  if (prefix && !/^[a-z0-9-]+$/.test(prefix)) throw new Error(`prefisso "${prefix}" non valido`);
  if (prefix === DEMO_PREFIX && !isLocalDatabase(url)) {
    throw new Error("il prefisso demo- è ammesso solo con un database locale: i dati demo non vanno in produzione");
  }
}

// Data di verifica di default: oggi, a Roma. Pura nell'argomento.
export function todayInRome(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(now);
}

async function editorialAuthorId(tx) {
  const [existing] = await tx`
    select id from public.local_tip_authors
    where kind = 'editorial' and display_name = ${AUTHOR_NAME}
    order by created_at limit 1`;
  if (existing) return existing.id;
  const [created] = await tx`
    insert into public.local_tip_authors (kind, display_name)
    values ('editorial', ${AUTHOR_NAME})
    returning id`;
  return created.id;
}

// Allinea i consigli editoriali di un target (luogo o attività) al file. Restituisce i conteggi.
async function syncTips(tx, authorId, target, bodies, verifiedAt) {
  const counts = { inserted: 0, reactivated: 0, deactivated: 0 };
  const existing = target.activityId
    ? await tx`select id, body, is_active from public.local_tips
               where author_id = ${authorId} and activity_id = ${target.activityId} and place_id is null`
    : await tx`select id, body, is_active from public.local_tips
               where author_id = ${authorId} and place_id = ${target.placeId} and activity_id is null`;
  for (const body of bodies) {
    const match = existing.find((row) => row.body === body);
    if (!match) {
      await tx`
        insert into public.local_tips (author_id, activity_id, place_id, body, verified_at)
        values (${authorId}, ${target.activityId ?? null}, ${target.placeId ?? null}, ${body}, ${verifiedAt})`;
      counts.inserted += 1;
    } else if (!match.is_active) {
      await tx`update public.local_tips set is_active = true where id = ${match.id}`;
      counts.reactivated += 1;
    }
  }
  for (const row of existing) {
    if (row.is_active && !bodies.includes(row.body)) {
      await tx`update public.local_tips set is_active = false where id = ${row.id}`;
      counts.deactivated += 1;
    }
  }
  return counts;
}

const emptyCounts = () => ({ inserted: 0, reactivated: 0, deactivated: 0 });

// Applica il catalogo gia' validato dentro la transazione tx. Restituisce il riepilogo.
export async function applyCatalog(tx, catalog, options) {
  const prefix = options.prefix ?? "";
  const verifiedAt = options.verifiedAt;
  if (!ITALIAN_DATE.test(verifiedAt)) throw new Error(`data di verifica non valida: ${verifiedAt}`);
  const authorId = await editorialAuthorId(tx);
  const report = {
    places: { updated: 0, missing: [] },
    activities: { updated: 0, missing: [] },
    itineraries: { updated: 0, missing: [] },
    tips: emptyCounts(),
  };
  const addTips = (counts) => {
    for (const key of Object.keys(report.tips)) report.tips[key] += counts[key];
  };

  for (const place of catalog.places) {
    const [row] = await tx`
      update public.places set description = ${place.descriptionIt}, tagline_it = ${place.taglineIt}
      where slug = ${prefix + place.slug} returning id`;
    if (!row) {
      report.places.missing.push(place.slug);
      continue;
    }
    report.places.updated += 1;
    addTips(await syncTips(tx, authorId, { placeId: row.id }, place.consigli, verifiedAt));
  }

  for (const activity of catalog.activities) {
    const [row] = await tx`
      update public.activities set title = ${activity.titleIt}, title_en = ${activity.titleEn},
        description = ${activity.descriptionIt}
      where slug = ${prefix + activity.slug} returning id`;
    if (!row) {
      report.activities.missing.push(activity.slug);
      continue;
    }
    report.activities.updated += 1;
    addTips(await syncTips(tx, authorId, { activityId: row.id }, activity.consigli, verifiedAt));
  }

  for (const itinerary of catalog.itineraries) {
    const [row] = await tx`
      select id, days from public.itineraries where slug = ${prefix + itinerary.slug} and is_template`;
    if (!row) {
      report.itineraries.missing.push(itinerary.slug);
      continue;
    }
    if (row.days !== itinerary.dayIntros.length || row.days !== itinerary.dayNotes.length) {
      throw new Error(
        `${itinerary.slug}: ${row.days} giorni nel database, ${itinerary.dayIntros.length} introduzioni e ${itinerary.dayNotes.length} note nel file`,
      );
    }
    await tx`
      update public.itineraries set title = ${itinerary.titleIt}, subtitle = ${itinerary.subtitleIt},
        description = ${itinerary.descriptionIt}, day_intros = ${itinerary.dayIntros}::text[],
        day_notes = ${itinerary.dayNotes}::text[], tips = ${itinerary.tips}::text[]
      where id = ${row.id}`;
    report.itineraries.updated += 1;
  }
  return report;
}

// Legge i tre file del catalogo dalla cartella. Riga di errore con il file.
export function readCatalogFiles(dir) {
  const read = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  return { luoghi: read("luoghi.json"), attivita: read("attivita.json"), itinerari: read("itinerari.json") };
}

// Esecuzione annullata di proposito (--dry-run): la transazione non lascia nulla.
class DryRunRollback extends Error {}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CATALOG_DIR = join(ROOT, "content", "catalog");

async function confirmRemote(host) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Scrivere i testi del catalogo su ${host}? Scrivi "si" per continuare: `);
    return answer.trim().toLowerCase() === "si";
  } finally {
    rl.close();
  }
}

function optionValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const prefix = optionValue(args, "slug-prefix") ?? "";
  const verifiedAt = optionValue(args, "verified-at") ?? todayInRome();
  config({ path: join(ROOT, ".env.local"), quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL mancante (.env.local o ambiente)");
  checkPrefix(prefix, url);

  const catalog = parseCatalog(readCatalogFiles(CATALOG_DIR));
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  const host = new URL(url).hostname;
  try {
    if (dryRun) {
      let report;
      try {
        await sql.begin(async (tx) => {
          report = await applyCatalog(tx, catalog, { prefix, verifiedAt });
          throw new DryRunRollback("annullata");
        });
      } catch (error) {
        if (!(error instanceof DryRunRollback)) throw error;
      }
      printReport(report, "piano (--dry-run: transazione annullata, nulla è stato scritto)");
      return;
    }
    if (!isLocalDatabase(url) && !args.includes("--yes")) {
      if (!process.stdin.isTTY || !(await confirmRemote(host))) {
        throw new Error("import annullato: conferma mancante per l'host " + host);
      }
    }
    let report;
    await sql.begin(async (tx) => {
      report = await applyCatalog(tx, catalog, { prefix, verifiedAt });
    });
    printReport(report, `importato su ${host}`);
  } finally {
    await sql.end();
  }
}

function printReport(report, title) {
  console.log(`${title}`);
  console.log(`luoghi aggiornati: ${report.places.updated}, mancanti: ${report.places.missing.join(", ") || "nessuno"}`);
  console.log(`attività aggiornate: ${report.activities.updated}, mancanti: ${report.activities.missing.join(", ") || "nessuna"}`);
  console.log(`itinerari aggiornati: ${report.itineraries.updated}, mancanti: ${report.itineraries.missing.join(", ") || "nessuno"}`);
  console.log(
    `consigli: inseriti ${report.tips.inserted}, riattivati ${report.tips.reactivated}, disattivati ${report.tips.deactivated}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
