import "server-only";
import { createHmac } from "node:crypto";
import { rateLimitSecret } from "@/server/affiliates/config";
import { clientIp } from "@/server/affiliates/rate-key";
import { hitRateLimit } from "@/server/db/rate-limiter";

// Limite generico per le azioni pubbliche senza un contatore dedicato (passo 11.5): accesso e codici
// via email, ospiti, aeroporti. Usa la stessa funzione SQL dei click affiliati (hit_rate_limit, finestra
// fissa). Il bucket è un HMAC di "<scopo>:<identità>" con la chiave del rate limit: nel database non
// compaiono IP, email o id in chiaro. Gli scopi sono distinti tra loro: un contatore non ne consuma un altro.

export type RateRule = { scope: string; limit: number; windowSeconds: number };

// allowed: sotto il limite. limited: limite raggiunto. unavailable: non è possibile dirlo
// (chiave mancante in produzione, contatore in errore).
export type RateDecision = "allowed" | "limited" | "unavailable";

export type RateCounter = (bucket: string, limit: number, windowSeconds: number) => Promise<boolean>;

export function rateBucket(scope: string, identity: string, secret: string): string {
  return createHmac("sha256", secret).update(`${scope}:${identity}`).digest("base64url");
}

// Senza chiave: in sviluppo il limite non si applica; in produzione la richiesta non è verificabile,
// quindi il chiamante la nega (RATE_LIMIT_SECRET va impostata, vedi docs/LANCIO.md).
function withoutSecret(): RateDecision {
  return process.env.VERCEL_ENV === "production" ? "unavailable" : "allowed";
}

const databaseCounter: RateCounter = (bucket, limit, windowSeconds) => hitRateLimit(bucket, limit, windowSeconds);

// Conta una richiesta per l'identità data e dice se è consentita. Il contatore è iniettabile per i test.
export async function checkRate(
  rule: RateRule,
  identity: string,
  options: { counter?: RateCounter; secret?: string | undefined } = {},
): Promise<RateDecision> {
  // Con `secret` esplicito (anche undefined) i test non leggono l'ambiente.
  const secret = "secret" in options ? options.secret : rateLimitSecret();
  if (!secret) return withoutSecret();
  const counter = options.counter ?? databaseCounter;
  try {
    const allowed = await counter(rateBucket(rule.scope, identity, secret), rule.limit, rule.windowSeconds);
    return allowed ? "allowed" : "limited";
  } catch {
    return "unavailable";
  }
}

export type RateCheck = { rule: RateRule; identity: string };

// Più contatori per la stessa richiesta (per IP e per email): vale il peggiore. Un contatore
// "limited" nega; "unavailable" nega (fail closed) a meno che il chiamante non lo ignori.
export async function checkRates(checks: RateCheck[], options: { counter?: RateCounter; secret?: string | undefined } = {}): Promise<RateDecision> {
  const decisions = await Promise.all(checks.map((check) => checkRate(check.rule, check.identity, options)));
  if (decisions.includes("limited")) return "limited";
  if (decisions.includes("unavailable")) return "unavailable";
  return "allowed";
}

// Identità per IP: il primo IP di x-forwarded-for (lo imposta Vercel). Senza IP (solo in locale e nei test
// e2e, mai su Vercel) il limite per IP non si applica: restano quelli per email e il CAPTCHA.
export function ipIdentity(headers: Headers): string | null {
  return clientIp(headers);
}

// Regole delle azioni di accesso (passo 11.5). Il numero è per IP, o per email quando indicato.
export const AUTH_RULES = {
  // Codice via email: 5 invii l'ora per indirizzo (niente bombardamento di una casella); per IP 30 l'ora,
  // largo perché molti utenti da rete mobile condividono lo stesso IP.
  sendCodeIp: { scope: "auth:send:ip", limit: 30, windowSeconds: 3600 },
  sendCodeEmail: { scope: "auth:send:email", limit: 5, windowSeconds: 3600 },
  // Verifica del codice: 10 tentativi ogni 15 minuti per indirizzo (il codice ha 6 cifre); per IP 60.
  verifyIp: { scope: "auth:verify:ip", limit: 60, windowSeconds: 900 },
  verifyEmail: { scope: "auth:verify:email", limit: 10, windowSeconds: 900 },
  // Sessioni ospite: 30 l'ora per IP, come il limite che Supabase già applica (anonymous_users).
  guestIp: { scope: "auth:guest:ip", limit: 30, windowSeconds: 3600 },
} as const satisfies Record<string, RateRule>;

// Recensioni (passo 11.5): 20 al giorno per utente a scrivere, 30 a segnalare. Qui un contatore non
// disponibile non blocca (fail open, come la ricerca): si nega solo al limite raggiunto.
export const REVIEW_RULES = {
  submit: { scope: "review:submit:user", limit: 20, windowSeconds: 86400 },
  report: { scope: "review:report:user", limit: 30, windowSeconds: 86400 },
} as const satisfies Record<string, RateRule>;

// Aeroporti per la combobox dei voli: ricerca pubblica, la si protegge senza fermarla per errore.
export const AIRPORT_RULE = { scope: "flights:airports:ip", limit: 120, windowSeconds: 60 } as const satisfies RateRule;
