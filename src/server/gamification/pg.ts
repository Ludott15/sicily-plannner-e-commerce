// Lettura degli errori di Postgres (codici di dominio P0001) e dei payload jsonb.
// Nessun import server-only: il modulo è puro e testabile.

// Drizzle avvolge l'errore di Postgres e nel messaggio del wrapper compaiono i parametri della
// query (coordinate comprese). Si legge quindi solo il messaggio della causa; il messaggio
// del wrapper è il ripiego, e non va mai registrato.
export function pgErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const { cause, message } = error as { cause?: unknown; message?: unknown };
  if (typeof cause === "object" && cause !== null && typeof (cause as { message?: unknown }).message === "string") {
    return (cause as { message: string }).message;
  }
  return typeof message === "string" ? message : "";
}

// Primo codice di dominio presente nel messaggio, con confini di parola: "not_allowed" non
// coincide con "guest_not_allowed".
export function matchCode<T extends string>(message: string, codes: readonly T[]): T | null {
  for (const code of codes) {
    if (new RegExp(`(^|[^a-z_])${code}($|[^a-z_])`).test(message)) return code;
  }
  return null;
}

// Il jsonb arriva come oggetto dal driver; se arriva come testo lo si decodifica.
export function parseJsonbPayload(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
