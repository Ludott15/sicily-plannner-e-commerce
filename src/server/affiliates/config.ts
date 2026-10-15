import "server-only";

// Parametri dei link affiliati (passo 3.1). Letti dall'ambiente solo sul server, mai con prefisso
// NEXT_PUBLIC_. Un valore vuoto (o di soli spazi) vale come assente: non si firma mai con una
// chiave vuota.

// Click consentiti per chiave (IP e utente) nella finestra, su /api/go/[id], /api/go/flight e /api/go/v.
export const GO_RATE_LIMIT = { limit: 60, windowSeconds: 60 } as const;

// Scadenza dei link firmati di alloggi e noleggi: un giorno.
export const VERTICAL_LINK_TTL_SECONDS = 60 * 60 * 24;

export function usableSecret(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value ? value : undefined;
}

// Chiave HMAC dei link di alloggi e noleggi (/api/go/v).
export function affiliateLinkSecret(): string | undefined {
  return usableSecret(process.env.AFFILIATE_LINK_SECRET);
}

// Chiave dei bucket del rate limit: RATE_LIMIT_SECRET se c'è, altrimenti quella dei link.
export function rateLimitSecret(): string | undefined {
  return usableSecret(process.env.RATE_LIMIT_SECRET) ?? affiliateLinkSecret();
}
