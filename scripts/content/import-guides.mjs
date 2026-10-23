// Importa le guide di content/guide/*.md nella tabella guides (passo 8.3). Fa upsert per slug,
// pubblica le guide e sostituisce i loro collegamenti ai luoghi (guide_links).
//
//   npm run content:guides -- --dry-run   mostra il piano, senza scrivere (legge il database)
//   npm run content:guides                scrive; chiede conferma se l'host non è locale
//   npm run content:guides -- --yes       come sopra, senza conferma
//
// Connessione: DATABASE_URL (come scripts/db/*.mjs; .env.local, mai sovrascritto dall'ambiente).
// Per la produzione esportare DATABASE_URL nella shell, non nel file. Dopo le migrazioni.
//
// Un luogo collegato che non esiste nel database viene saltato con un avviso: la guida si importa lo stesso.

import { config } from "dotenv";
import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { splitFrontmatter } from "./frontmatter.mjs";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// Una guida dal suo file. Il nome del file deve coincidere con lo slug. Il frontmatter accetta
// slug, title, summary, author e links (lista di "- place: <slug>"). Pura.
export function parseGuideSource(source, fileName) {
  const { data, body } = splitFrontmatter(source);
  const fail = (message) => {
    throw new Error(`${fileName}: ${message}`);
  };
  const text = (key, max, required) => {
    const value = data[key];
    if (value === undefined) {
      if (required) fail(`manca "${key}"`);
      return null;
    }
    if (typeof value !== "string") fail(`"${key}" deve essere un testo`);
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      if (required) fail(`"${key}" è vuoto`);
      return null;
    }
    if (trimmed.length > max) fail(`"${key}" supera ${max} caratteri`);
    return trimmed;
  };

  const slug = text("slug", 120, true);
  if (!SLUG.test(slug)) fail(`slug "${slug}" non valido`);
  if (slug !== fileName.replace(/\.md$/, "")) fail(`lo slug "${slug}" non coincide con il nome del file`);
  const title = text("title", 160, true);
  const author = text("author", 120, true);
  if (author.length < 2) fail(`"author" troppo corto`);
  const summary = text("summary", 300, false);
  if (body.trim().length === 0) fail("il corpo è vuoto");
  if (body.trim().length > 60000) fail("il corpo supera 60000 caratteri");

  const rawLinks = data.links ?? [];
  if (!Array.isArray(rawLinks)) fail(`"links" deve essere una lista`);
  const places = rawLinks.map((link) => {
    if (typeof link !== "object" || Array.isArray(link)) fail(`ogni link è "- place: <slug>"`);
    const keys = Object.keys(link);
    if (keys.length !== 1 || keys[0] !== "place") fail(`link non supportato: ${keys.join(", ")}`);
    const target = link.place;
    if (typeof target !== "string" || !SLUG.test(target)) fail(`slug del luogo "${String(target)}" non valido`);
    return target;
  });
  if (new Set(places).size !== places.length) fail("luogo collegato due volte");

  return { slug, title, summary, author, body: body.trimEnd() + "\n", places };
}

// Piano dell'import. placeIds: mappa slug del luogo → id esistente. Pura.
// Restituisce le righe da scrivere e i collegamenti saltati (luoghi che non esistono).
export function planGuideImport(guides, placeIds) {
  const upserts = [];
  const skipped = [];
  for (const guide of guides) {
    const links = [];
    guide.places.forEach((slug, position) => {
      const id = placeIds.get(slug);
      if (id === undefined) skipped.push({ guide: guide.slug, place: slug });
      else links.push({ placeId: id, position });
    });
    upserts.push({ ...guide, links });
  }
  return { upserts, skipped };
}

// Solo i file con nome in minuscolo (lo slug della guida): FONTI.md e gli altri file in maiuscolo
// non sono guide. Pura.
export function isGuideFile(file) {
  return /^[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(file);
}

export function readGuides(dir) {
  return readdirSync(dir)
    .filter(isGuideFile)
    .sort()
    .map((file) => parseGuideSource(readFileSync(join(dir, file), "utf8"), file));
}

// Host di DATABASE_URL: locale o no. Pura.
export function isLocalDatabase(url) {
  const host = new URL(url).hostname;
  return LOCAL_HOSTS.has(host);
}

// Prefissi degli slug dei dati di prova: ammessi solo verso un database locale (content:guides e
// content:catalog). Pura.
export const LOCAL_ONLY_PREFIXES = ["demo-", "e2e-", "int-"];
export function checkPrefix(prefix, url) {
  if (prefix && !/^[a-z0-9-]+$/.test(prefix)) throw new Error(`prefisso "${prefix}" non valido`);
  if (LOCAL_ONLY_PREFIXES.includes(prefix) && !isLocalDatabase(url)) {
    throw new Error(`il prefisso ${prefix} è ammesso solo con un database locale: i dati di prova non vanno in produzione`);
  }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUIDE_DIR = join(ROOT, "content", "guide");

async function confirmRemote(host) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Scrivere le guide su ${host}? Scrivi "si" per continuare: `);
    return answer.trim().toLowerCase() === "si";
  } finally {
    rl.close();
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  config({ path: join(ROOT, ".env.local"), quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL mancante (.env.local o ambiente)");

  const guides = readGuides(GUIDE_DIR);
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    // --slug-prefix=demo-: in locale e in CI i luoghi del seed hanno il prefisso (come content:catalog).
    const prefixArg = process.argv.slice(2).find((arg) => arg.startsWith("--slug-prefix="));
    const prefix = prefixArg ? prefixArg.slice("--slug-prefix=".length) : "";
    checkPrefix(prefix, url);
    const slugs = [...new Set(guides.flatMap((guide) => guide.places))].map((slug) => prefix + slug);
    const places = await sql`select id, slug from public.places where slug = any(${slugs}::text[])`;
    const placeIds = new Map(places.map((row) => [row.slug.slice(prefix.length), row.id]));
    const plan = planGuideImport(guides, placeIds);

    for (const skip of plan.skipped) console.warn(`saltato il luogo "${skip.place}" in ${skip.guide}: non esiste`);
    for (const guide of plan.upserts) {
      console.log(`${dryRun ? "piano" : "guida"}: ${guide.slug} (${guide.links.length} luoghi collegati)`);
    }
    if (dryRun) {
      console.log(`--dry-run: ${plan.upserts.length} guide, nessuna scrittura`);
      return;
    }

    const host = new URL(url).hostname;
    if (!isLocalDatabase(url) && !args.has("--yes")) {
      if (!process.stdin.isTTY || !(await confirmRemote(host))) {
        throw new Error("import annullato: conferma mancante per l'host " + host);
      }
    }

    await sql.begin(async (tx) => {
      for (const guide of plan.upserts) {
        const [row] = await tx`
          insert into public.guides (slug, title_it, summary_it, body_it, author_name, status, published_at)
          values (${guide.slug}, ${guide.title}, ${guide.summary}, ${guide.body}, ${guide.author}, 'published', now())
          on conflict (slug) do update set
            title_it = excluded.title_it,
            summary_it = excluded.summary_it,
            body_it = excluded.body_it,
            author_name = excluded.author_name,
            status = 'published',
            published_at = coalesce(public.guides.published_at, excluded.published_at),
            updated_at = now()
          returning id`;
        await tx`delete from public.guide_links where guide_id = ${row.id}`;
        for (const link of guide.links) {
          await tx`
            insert into public.guide_links (guide_id, kind, target_id, position)
            values (${row.id}, 'place', ${link.placeId}, ${link.position})`;
        }
      }
    });
    console.log(`importate ${plan.upserts.length} guide su ${host}`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
