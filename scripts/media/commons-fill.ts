// Foto da Wikimedia Commons per luoghi, attività e itinerari senza una foto vera (docs/IMMAGINI.md).
// Stesso codice dell'azione "Trova e assegna le foto mancanti" (src/server/media/commons-fill.admin.ts).
//
//   npm run media:commons-fill -- --dry-run          simulazione: stampa le foto scelte, non scrive nulla
//   npm run media:commons-fill -- --user <uuid>      assegna le foto; <uuid> è l'admin che le importa
//   opzioni: --limit N   elabora al massimo N entità (anche in simulazione)
//            --allow-sa  ammette CC BY-SA (scelta dell'admin, docs/IMMAGINI.md)
//   npm run media:commons-fill -- --from-file content/media/commons-scelte.json [--slug-prefix demo-] [--user <uuid>]
//            importa esattamente i file scelti a mano (stesse verifiche di licenza, idempotente);
//            senza --user è una simulazione. --slug-prefix aggiunge il prefisso agli slug del file (locale: demo-).
//
// Richiede Supabase locale avviato (npm run db:start) e WIKIMEDIA_CONTACT in .env.local. Le richieste
// verso Wikimedia sono in fila, una al secondo, con User-Agent che porta il contatto (src/server/media/wikimedia.ts).
// Senza --user non scrive mai: è la modalità predefinita, la stessa del --dry-run.

import { config } from "dotenv";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { FillItem } from "../../src/server/media/commons-fill.admin";

type Args = { dryRun: boolean; userId: string | null; limit: number | null; allowSa: boolean; fromFile: string | null; slugPrefix: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseArgs(argv: readonly string[]): Args | { error: string } {
  const args: Args = { dryRun: true, userId: null, limit: null, allowSa: false, fromFile: null, slugPrefix: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--allow-sa") args.allowSa = true;
    else if (arg === "--from-file") {
      const value = argv[++i] ?? "";
      if (value === "") return { error: "--from-file richiede il percorso del file delle scelte" };
      args.fromFile = value;
    } else if (arg === "--slug-prefix") args.slugPrefix = argv[++i] ?? "";
    else if (arg === "--user") {
      const value = argv[++i] ?? "";
      if (!UUID.test(value)) return { error: "--user richiede l'uuid di un admin" };
      args.userId = value;
      args.dryRun = false;
    } else if (arg === "--limit") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) return { error: "--limit richiede un numero intero positivo" };
      args.limit = value;
    } else {
      return { error: `opzione sconosciuta: ${arg ?? ""}` };
    }
  }
  if (!args.dryRun && args.userId === null) return { error: "per scrivere serve --user <uuid>; senza, c'è solo --dry-run" };
  return args;
}

async function main() {
  // Prima le variabili d'ambiente: la connessione al database le legge quando il modulo viene caricato.
  config({ path: path.join(process.cwd(), ".env.local") });
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(parsed.error);
    process.exitCode = 1;
    return;
  }
  const args = parsed;
  if (args.fromFile !== null) {
    await runFromFile(args.fromFile, args.slugPrefix, args.userId);
    return;
  }
  const { fillCommonsPhotos } = await import("../../src/server/media/commons-fill.admin");
  const { listPhotoNeeds } = await import("../../src/server/media/admin-queries.admin");

  const total = (await listPhotoNeeds()).length;
  const label = args.dryRun ? "SIMULAZIONE (nessuna scrittura)" : "SCRITTURA";
  console.log(`${label}: ${total} entità senza foto vera${args.limit ? `, si elaborano al massimo ${args.limit}` : ""}.`);

  const skip = new Set<string>();
  const items: FillItem[] = [];
  let remaining = Infinity;
  while (remaining > 0) {
    const room = args.limit === null ? 5 : Math.min(5, args.limit - items.length);
    if (room <= 0) break;
    const step = await fillCommonsPhotos({ skip, limit: room, allowSa: args.allowSa, userId: args.userId });
    if (step.items.length === 0) break;
    for (const item of step.items) {
      skip.add(item.key);
      items.push(item);
      console.log(describe(item));
    }
    remaining = step.remaining;
  }

  summary(items, total, args.dryRun);
  process.exit(0);
}

type Chosen = { type: "activity" | "place"; slug: string; file: string; motivo: string; alt_it: string; allow_sa: boolean };

function readChosen(raw: unknown): Chosen[] {
  if (!Array.isArray(raw)) throw new Error("il file delle scelte deve essere un array");
  return raw.map((entry: unknown, index) => {
    const e = entry as Record<string, unknown>;
    const ok = (e.type === "activity" || e.type === "place") && typeof e.slug === "string" && typeof e.file === "string" && e.file.startsWith("File:") && typeof e.motivo === "string" && typeof e.alt_it === "string" && e.alt_it.trim() !== "";
    if (!ok) throw new Error(`voce ${index + 1} non valida: servono type (activity|place), slug, file "File:…", motivo, alt_it`);
    if (e.allow_sa !== undefined && typeof e.allow_sa !== "boolean") throw new Error(`voce ${index + 1}: allow_sa deve essere true o false`);
    return { type: e.type as Chosen["type"], slug: e.slug as string, file: e.file as string, motivo: e.motivo as string, alt_it: e.alt_it as string, allow_sa: e.allow_sa === true };
  });
}

async function runFromFile(file: string, slugPrefix: string, userId: string | null) {
  const chosen = readChosen(JSON.parse(await readFile(path.join(process.cwd(), file), "utf8")) as unknown);
  const { importChosenFiles } = await import("../../src/server/media/commons-fill.admin");
  const dryRun = userId === null;
  console.log(`${dryRun ? "SIMULAZIONE (nessuna scrittura)" : "SCRITTURA"}: ${chosen.length} file scelti da ${file}, prefisso slug "${slugPrefix}".`);
  const { results, remaining } = await importChosenFiles(chosen, { slugPrefix, userId });
  for (const r of results) {
    const tail = [r.license ? `licenza ${r.license}` : null, r.reason ? `${r.reason}` : null].filter(Boolean).join(" · ");
    console.log(`  ${r.outcome.padEnd(16)} ${r.type.padEnd(9)} ${r.slug}  ← ${r.file}${tail ? `  (${tail})` : ""}`);
  }
  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  console.log("");
  console.log(`Riepilogo: ${count("assigned")} ${dryRun ? "da assegnare" : "assegnate"}, ${count("already_imported")} già importate, ${count("rejected")} rifiutate, ${count("not_needed")} non più necessarie.`);
  const left = remaining.map((n) => `${n.type} ${n.slug}`);
  console.log(`Attività e luoghi ancora senza foto propria: ${left.length}${left.length ? ` → ${left.join(", ")}` : ""}`);
  process.exit(0);
}

function describe(item: FillItem): string {
  const head = `${item.type.padEnd(9)} ${item.name}`;
  if (item.outcome === "assigned") {
    const c = item.candidate;
    const from = c ? `${c.source === "wikipedia" ? "Wikipedia" : "Commons"}, ${c.title}, licenza ${c.license ?? "?"}${c.score !== null ? `, punteggio ${c.score}` : ""}` : "";
    return `  OK     ${head}  ← ${from}${item.detail ? ` (voce: ${item.detail})` : ""}`;
  }
  if (item.outcome === "reused") return `  RIUSO  ${head}  ← foto di un suo luogo (media ${item.mediaId})`;
  return `  --     ${head}  ← ${item.reason ?? "?"}${item.detail ? ` · ${item.detail}` : ""}`;
}

function summary(items: readonly FillItem[], total: number, dryRun: boolean) {
  const assigned = items.filter((i) => i.outcome === "assigned").length;
  const reused = items.filter((i) => i.outcome === "reused").length;
  const skipped = items.filter((i) => i.outcome === "skipped");
  const errors = skipped.filter((i) => i.reason !== undefined && /^(fetch_|wiki_network|metadata_unavailable|storage_failed|import_failed|download)/.test(i.reason));
  const byReason = new Map<string, number>();
  for (const item of skipped) byReason.set(item.reason ?? "?", (byReason.get(item.reason ?? "?") ?? 0) + 1);
  const covered = assigned + reused;
  console.log("");
  console.log(`Riepilogo (${dryRun ? "simulazione" : "scrittura"}): ${items.length} entità elaborate su ${total}.`);
  console.log(`  ${dryRun ? "con foto da assegnare" : "assegnate"}: ${assigned}`);
  console.log(`  riusate dalla foto di un luogo (aree): ${reused}`);
  console.log(`  senza candidato valido (da fare a mano): ${skipped.length - errors.length}`);
  console.log(`  errori: ${errors.length}`);
  console.log(`  coperte: ${covered} di ${items.length} elaborate`);
  for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${reason}: ${count}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
