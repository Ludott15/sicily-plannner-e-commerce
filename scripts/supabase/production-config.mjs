// Controlli sul blocco [remotes.production] di supabase/config.toml (docs/LANCIO.md).
// Lo usano il test unitario production-config.test.ts (quindi la CI) e lo script di push
// push-production.mjs, che si rifiuta di partire se qualcosa non va.
//
// La CLI di Supabase applica il blocco solo se il suo project_id coincide con il progetto
// collegato: con il segnaposto, `supabase config push` spingerebbe in produzione i valori
// locali (localhost, chiavi di prova). Per questo il push passa solo dallo script.

export const PLACEHOLDER_PROJECT_ID = "xxxxxxxxxxxxxxxxxxxx";

// Righe del file che appartengono a [remotes.production] e alle sue sottotabelle.
export function productionBlock(toml) {
  const lines = toml.split(/\r?\n/);
  const out = [];
  let inside = false;
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*(#.*)?$/);
    if (header) inside = header[1] === "remotes.production" || header[1].startsWith("remotes.production.");
    if (inside) out.push(line);
  }
  return out.join("\n");
}

// Valore di una chiave in una tabella del blocco (stringa tra virgolette, numero o booleano).
function value(block, table, key) {
  const lines = block.split("\n");
  let current = null;
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]/);
    if (header) {
      current = header[1];
      continue;
    }
    if (current !== table) continue;
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*(#.*)?$`));
    if (m) return m[1].replace(/^"(.*)"$/, "$1");
  }
  return undefined;
}

// Chiavi di prova di Cloudflare Turnstile (site key e secret): 1x/2x/3x seguiti da zeri.
const TURNSTILE_TEST_KEY = /\b[123]x0{10,}[A-Z]{2}\b/;

export function productionConfigProblems(toml) {
  const block = productionBlock(toml);
  if (!block.trim()) return ["manca il blocco [remotes.production]"];
  const code = block
    .split("\n")
    .map((l) => l.replace(/#.*$/, ""))
    .join("\n");
  const problems = [];
  if (/localhost|127\.0\.0\.1/.test(code)) problems.push("valori locali (localhost o 127.0.0.1)");
  if (/http:\/\//.test(code)) problems.push("URL non https");
  if (TURNSTILE_TEST_KEY.test(code)) problems.push("chiavi di prova di Cloudflare Turnstile");

  const P = "remotes.production";
  const projectId = value(block, P, "project_id");
  if (!projectId || !/^[a-z]{20}$/.test(projectId)) problems.push("project_id assente o non valido");
  if (!/^env\(.+\)$/.test(value(block, `${P}.auth`, "site_url") ?? "")) problems.push("auth.site_url deve venire da env()");
  if (!/^\[\s*"env\(.+\)"/.test(value(block, `${P}.auth`, "additional_redirect_urls") ?? ""))
    problems.push("auth.additional_redirect_urls deve venire da env()");
  if (value(block, `${P}.auth.captcha`, "enabled") !== "true") problems.push("captcha non attivo");
  if (!/^env\(.+\)$/.test(value(block, `${P}.auth.captcha`, "secret") ?? "")) problems.push("captcha.secret deve venire da env()");
  if (value(block, `${P}.auth.email`, "enable_confirmations") !== "true") problems.push("enable_confirmations deve essere true");
  if (value(block, `${P}.auth.email.smtp`, "enabled") !== "true") problems.push("SMTP personalizzato non attivo");
  if (!/^env\(.+\)$/.test(value(block, `${P}.auth.email.smtp`, "pass") ?? "")) problems.push("smtp.pass deve venire da env()");
  if (!/^env\(.+\)$/.test(value(block, `${P}.auth.email.smtp`, "admin_email") ?? ""))
    problems.push("smtp.admin_email (mittente) deve venire da env()");
  const emailSent = Number(value(block, `${P}.auth.rate_limit`, "email_sent"));
  if (!(emailSent >= 30)) problems.push("rate_limit.email_sent troppo basso per la produzione (almeno 30 all'ora)");
  return problems;
}

// Variabili lette con env() dal blocco di produzione. Se una manca, la CLI lascerebbe nel
// valore il testo "env(NOME)" e lo spingerebbe così: il push si ferma prima.
export function productionEnvNames(toml) {
  return [...new Set([...productionBlock(toml).matchAll(/env\(([A-Z0-9_]+)\)/g)].map((m) => m[1]))];
}

// Variabili dei provider esterni attivi nella configurazione base ([auth.external.*] con
// enabled = true): il blocco di produzione li eredita, quindi servono anche al push.
export function inheritedProviderEnvNames(toml) {
  const names = [];
  let table = null;
  let enabled = false;
  let pending = [];
  const flush = () => {
    if (table && enabled) names.push(...pending);
  };
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "");
    const header = line.match(/^\s*\[([^\]]+)\]/);
    if (header) {
      flush();
      table = /^auth\.external\.[a-z_]+$/.test(header[1]) ? header[1] : null;
      enabled = false;
      pending = [];
      continue;
    }
    if (!table) continue;
    if (/^\s*enabled\s*=\s*true\s*$/.test(line)) enabled = true;
    for (const m of line.matchAll(/env\(([A-Z0-9_]+)\)/g)) pending.push(m[1]);
  }
  flush();
  return [...new Set(names)];
}

// Controlli prima di `supabase config push` verso produzione.
export function pushPreflightProblems({ toml, linkedRef, env }) {
  const problems = productionConfigProblems(toml);
  const projectId = productionBlock(toml).match(/^\s*project_id\s*=\s*"([^"]*)"/m)?.[1];
  if (projectId === PLACEHOLDER_PROJECT_ID) problems.push("project_id è ancora il segnaposto: scrivi il ref del progetto di produzione");
  if (!linkedRef) problems.push("nessun progetto collegato: esegui `npx supabase link --project-ref <ref>`");
  else if (projectId !== linkedRef) problems.push(`il progetto collegato (${linkedRef}) non è quello di [remotes.production] (${projectId})`);
  for (const name of [...productionEnvNames(toml), ...inheritedProviderEnvNames(toml)]) {
    const v = env[name];
    if (!v) problems.push(`variabile ${name} non impostata`);
    else if (/localhost|127\.0\.0\.1|^http:\/\//.test(v)) problems.push(`${name} ha un valore locale`);
    else if (/\b[123]x0{10,}[A-Z]{2}\b/.test(v)) problems.push(`${name} è una chiave di prova di Cloudflare`);
  }
  return problems;
}
