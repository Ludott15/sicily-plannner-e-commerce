import { GROUP_ERROR_CODES, type GroupErrorCode } from "./state";

// Errori dei gruppi: dal database (P0001 con messaggio stabile, 42501 per la RLS) e dall'app.
// Pura: nessuna dipendenza dal database, quindi testabile senza rete.

// Errore lanciato dentro una transazione dall'app: la transazione torna indietro e l'azione
// risponde con il suo codice.
export class GroupActionError extends Error {
  readonly code: GroupErrorCode;

  constructor(code: GroupErrorCode) {
    super(code);
    this.name = "GroupActionError";
    this.code = code;
  }
}

const DOMAIN_CODES: ReadonlySet<string> = new Set<string>(
  GROUP_ERROR_CODES.filter((code) => code !== "invalid" && code !== "failed"),
);

function isDomainCode(message: string): message is GroupErrorCode {
  return DOMAIN_CODES.has(message);
}

// Codice dell'errore di una azione. Drizzle avvolge l'errore di Postgres in `cause`: si scende
// lungo la catena. P0001 con un messaggio di dominio dà quel codice; 42501 (la RLS nega la
// scrittura) dà not_group_owner, che è l'unica scrittura che la RLS nega ai gruppi a chi non può;
// il resto è failed.
export function groupErrorCodeOf(error: unknown): GroupErrorCode {
  if (error instanceof GroupActionError) return error.code;
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const { code, message, cause } = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (code === "P0001" && typeof message === "string" && isDomainCode(message)) return message;
    if (code === "42501") return "not_group_owner";
    current = cause;
  }
  return "failed";
}
