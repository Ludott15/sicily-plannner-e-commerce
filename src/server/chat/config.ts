import "server-only";

// Configurazione del chatbot (passo 9.1). Le variabili d'ambiente si leggono qui e nel resto del
// modulo solo tramite queste funzioni. Il modello di prova (CHAT_TEST_MODEL=scripted) non esiste
// su Vercel: con VERCEL_ENV presente è sempre spento.

export const CHAT_MODEL = "claude-sonnet-5-5";
export const CHAT_SHORT_MODEL = "claude-haiku-5-5";

export const CHAT_DAILY_LIMIT = { user: 40, guest: 10 } as const;
export const CHAT_IP_LIMIT = { limit: 120, windowSeconds: 3600 } as const;
export const CHAT_DAY_SECONDS = 86400;
export const CHAT_MAX_TOOL_ROUNDS = 6;
export const CHAT_HISTORY = 20;
export const CHAT_MAX_INPUT_CHARS = 2000;
export const CHAT_MAX_TOKENS = 2048;
export const CHAT_TIMEOUT_MS = 60_000;
export const CHAT_MAX_RETRIES = 1;

// Prezzi per milione di token in dollari. Valori indicativi: da verificare sulla pagina prezzi di
// Anthropic prima del lancio (docs/LANCIO.md, sezione Chatbot). Usati solo per la stima dei costi
// nell'admin, mai per addebitare nulla.
export type AiPrice = { input: number; output: number; cacheRead: number; cacheWrite: number };
export const AI_PRICES: Record<string, AiPrice> = {
  [CHAT_MODEL]: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  [CHAT_SHORT_MODEL]: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function chatTestModelActive(): boolean {
  return env("CHAT_TEST_MODEL") === "scripted" && env("VERCEL_ENV") === undefined;
}

export function anthropicApiKey(): string | undefined {
  return env("ANTHROPIC_API_KEY");
}

// Chatbot acceso: non disattivato con CHAT_ENABLED=false, e con una chiave (o il modello di prova).
export function chatEnabled(): boolean {
  if (env("CHAT_ENABLED") === "false") return false;
  return chatTestModelActive() || anthropicApiKey() !== undefined;
}

// Limite giornaliero: gli ospiti hanno il loro. Solo fuori da Vercel si può abbassarlo per i test.
export function dailyLimitFor(isAnonymous: boolean): number {
  if (!isAnonymous) return CHAT_DAILY_LIMIT.user;
  const override = env("CHAT_GUEST_DAILY_LIMIT");
  if (override && env("VERCEL_ENV") === undefined) {
    const parsed = Number(override);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= CHAT_DAILY_LIMIT.guest) return parsed;
  }
  return CHAT_DAILY_LIMIT.guest;
}
