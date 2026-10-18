// Genera generated/content/legal.ts a partire da content/legal/*.md (testi legali, passo 8.3).
//
//   node scripts/content/build-legal.mjs           scrive generated/content/legal.ts
//   node scripts/content/build-legal.mjs --check   esce con 1 se il file generato non è aggiornato
//
// Ogni file <id>.it.md ha nell'intestazione "updated: AAAA-MM-GG" e "version: n". Un file
// <id>.en.md, se c'è, dà la versione inglese; senza, il campo en è null. Le variabili {{nome}} devono
// stare in LEGAL_VARIABLES (src/lib/legal-text.ts): un refuso blocca il build.
// L'output è deterministico: stessi file, stesso risultato byte per byte.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { splitFrontmatter } from "./frontmatter.mjs";

const HEADER =
  "Generato da scripts/content/build-legal.mjs a partire da content/legal/*.md. Non modificare a mano: npm run content:legal";

// Stesso elenco di LEGAL_VARIABLES in src/lib/legal-text.ts (il test lo verifica).
export const KNOWN_VARIABLES = [
  "titolare",
  "sede",
  "partita_iva",
  "email_privacy",
  "email_assistenza",
  "spedizione_testo",
];

const VARIABLE_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = /^[1-9]\d*$/;

// Testo di un documento legale da un file sorgente: intestazione validata, variabili controllate.
export function parseLegalSource(source, fileName) {
  const { data, body } = splitFrontmatter(source);
  const { updated, version } = data;
  if (typeof updated !== "string" || !DATE.test(updated)) {
    throw new Error(`${fileName}: "updated" deve essere AAAA-MM-GG`);
  }
  if (typeof version !== "string" || !VERSION.test(version)) {
    throw new Error(`${fileName}: "version" deve essere un intero positivo`);
  }
  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    if (!KNOWN_VARIABLES.includes(match[1])) {
      throw new Error(`${fileName}: variabile sconosciuta {{${match[1]}}}`);
    }
  }
  const text = body.trimEnd() + "\n";
  return { text, updatedAt: updated, version };
}

// Modulo TypeScript dai documenti: { id: { it, en, updatedAt, version } }, ordinati per id.
// Le stringhe passano da JSON.stringify: sono letterali TypeScript validi, qualunque sia il testo.
export function renderLegalModule(docs) {
  const ids = Object.keys(docs).sort();
  const lines = [`// ${HEADER}`, ""];
  lines.push("export type LegalDocId = " + (ids.map((id) => JSON.stringify(id)).join(" | ") || "never") + ";");
  lines.push("");
  lines.push("export type LegalDoc = {");
  lines.push("  it: string;");
  lines.push("  en: string | null;");
  lines.push("  updatedAt: string;");
  lines.push("  version: string;");
  lines.push("};");
  lines.push("");
  lines.push("export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {");
  for (const id of ids) {
    const doc = docs[id];
    lines.push(`  ${JSON.stringify(id)}: {`);
    lines.push(`    it: ${JSON.stringify(doc.it)},`);
    lines.push(`    en: ${doc.en === null ? "null" : JSON.stringify(doc.en)},`);
    lines.push(`    updatedAt: ${JSON.stringify(doc.updatedAt)},`);
    lines.push(`    version: ${JSON.stringify(doc.version)},`);
    lines.push("  },");
  }
  lines.push("};");
  lines.push("");
  return lines.join("\n");
}

// Documenti da una cartella: un <id>.it.md per documento, un <id>.en.md facoltativo.
export function loadLegalDocs(dir) {
  const files = readdirSync(dir).sort();
  const docs = {};
  for (const file of files) {
    const match = /^([a-z0-9-]+)\.it\.md$/.exec(file);
    if (!match) continue;
    const id = match[1];
    const parsed = parseLegalSource(readFileSync(join(dir, file), "utf8"), file);
    const enPath = join(dir, `${id}.en.md`);
    const en = existsSync(enPath) ? parseLegalSource(readFileSync(enPath, "utf8"), `${id}.en.md`).text : null;
    docs[id] = { it: parsed.text, en, updatedAt: parsed.updatedAt, version: parsed.version };
  }
  return docs;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE_DIR = join(ROOT, "content", "legal");
const OUTPUT = join(ROOT, "generated", "content", "legal.ts");

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  const output = renderLegalModule(loadLegalDocs(SOURCE_DIR));
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : null;
  if (check) {
    if (current !== output) {
      console.error("generated/content/legal.ts non è aggiornato: esegui npm run content:legal");
      process.exit(1);
    }
    console.log("generated/content/legal.ts aggiornato");
  } else {
    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, output);
    console.log(`scritto ${OUTPUT}`);
  }
}
