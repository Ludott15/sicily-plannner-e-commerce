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
import { CHOSEN_BATCH_SIZE, chosenPages, chosenPhotosSchema } from "../../src/lib/media-chosen";
import { isLocalDatabase, localStorageWriter, readLocalSupabase } from "./local-storage";
import type { FillItem } from "../../src/server/media/commons-fill.admin";

type Args = { dryRun: boolean; userId: string | null; limit: number | null; allowSa: boolean; fromFile: string | null; slugPrefix: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseArgs(argv: readonly string[]): Args | { error: string } {
  const args: Args = { dryRun: true, userId: null, limit: null, allowSa: false, fromFile: null, slugPrefix: "" };
  let dryFlag = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      args.dryRun = true;
      dryFlag = true;
    }
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
  if (dryFlag && args.userId !== null) return { error: "--dry-run e --user non possono stare insieme: la simulazione non scrive" };
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
    await runFromFile(args.fromFile, args.slugPrefix, args.dryRun ? null : args.userId);
    return;
  }
  if (args.userId !== null) {
    console.error("Con --user l'assegnazione automatica non si esegue da script: usa --from-file (scelte della redazione) o il pulsante admin.");
    process.exitCode = 1;
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
  // Pagine scelte nei passi precedenti: in simulazione non sono nel database, ma non vanno riproposte.
  const chosenFiles = new Set<string>();
  while (remaining > 0) {
    // Passi di CHOSEN_BATCH_SIZE voci (come chosenPages), con lo stesso insieme skip tra i passi:
    // un'entità elaborata non torna in un passo successivo, anche in simulazione.
    const room = args.limit === null ? CHOSEN_BATCH_SIZE : Math.min(CHOSEN_BATCH_SIZE, args.limit - items.length);
    if (room <= 0) break;
    const step = await fillCommonsPhotos({ skip, limit: room, allowSa: args.allowSa, userId: args.userId, chosenPages: chosenFiles });
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

async function runFromFile(file: string, slugPrefix: string, userId: string | null) {
  const root = process.cwd();
  const parsed = chosenPhotosSchema.safeParse(JSON.parse(await readFile(path.join(root, file), "utf8")) as unknown);
  if (!parsed.success) {
    console.error(`File delle scelte non valido: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "voce"} ${i.message}`).join("; ")}`);
    process.exitCode = 1;
    return;
  }
  const chosen = parsed.data;
  let storage: ReturnType<typeof localStorageWriter> | undefined;
  if (userId !== null) {
    // Scrittura da script solo sul Supabase locale: database e API devono essere su localhost.
    if (!isLocalDatabase(process.env.DATABASE_URL ?? "")) {
      console.error("La scrittura da script è solo sul database locale. In produzione usa il pulsante «Importa le foto scelte dalla redazione» nella pagina admin delle immagini.");
      process.exitCode = 1;
      return;
    }
    const local = readLocalSupabase(root);
    if (!isLocalDatabase(local.apiUrl)) {
      console.error(`L'API di storage (${local.apiUrl}) non è locale: scrittura annullata.`);
      process.exitCode = 1;
      return;
    }
    storage = localStorageWriter(local.apiUrl, local.secretKey);
  }
  if (userId !== null) {
    // L'utente che scrive deve essere admin (stessa regola di requireAdmin nell'app).
    const { dbAdmin } = await import("../../src/server/db/admin");
    const { sql } = await import("drizzle-orm");
    const rows = [...(await dbAdmin.execute<{ role: string }>(sql`select role from public.profiles where id = ${userId}`))];
    if (rows[0]?.role !== "admin") {
      console.error(`L'utente ${userId} non è admin (profiles.role): scrittura annullata.`);
      process.exitCode = 1;
      return;
    }
  }
  const { importChosenFiles } = await import("../../src/server/media/commons-fill.admin");
  const dryRun = userId === null;
  console.log(`${dryRun ? "SIMULAZIONE (nessuna scrittura)" : "SCRITTURA LOCALE"}: ${chosen.length} file scelti da ${file}, prefisso slug "${slugPrefix}".`);
  // Passi di chosenPages con lo stesso insieme done: un'entità elaborata non torna in un passo successivo.
  const done = new Set<string>();
  const results: Awaited<ReturnType<typeof importChosenFiles>>["results"] = [];
  let remaining: Awaited<ReturnType<typeof importChosenFiles>>["remaining"] = [];
  for (const page of chosenPages(chosen)) {
    const step = await importChosenFiles(page, { slugPrefix, userId, storage, done });
    results.push(...step.results);
    remaining = step.remaining;
  }
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
