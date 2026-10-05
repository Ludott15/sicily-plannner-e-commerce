// Push della configurazione di Supabase Auth al progetto di produzione (docs/LANCIO.md).
// Uso: npm run supabase:push-production -- [--diff]
// Si ferma se il blocco [remotes.production] non è pronto, se il progetto collegato non è
// quello di produzione o se manca una variabile letta con env(). Con --diff mostra solo le
// differenze. La CLI chiede conferma per ogni risorsa prima di scrivere.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pushPreflightProblems } from "./production-config.mjs";

const toml = readFileSync("supabase/config.toml", "utf8");
const refFile = "supabase/.temp/project-ref";
const linkedRef = existsSync(refFile) ? readFileSync(refFile, "utf8").trim() : null;

const problems = pushPreflightProblems({ toml, linkedRef, env: process.env });
if (problems.length > 0) {
  console.error("Push verso produzione bloccato:");
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}

const command = process.argv.includes("--diff") ? "diff" : "push";
const result = spawnSync("npx", ["supabase", "config", command, "--project-ref", linkedRef], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
