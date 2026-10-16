// Utilità comuni alle azioni admin dello shop: errori di validazione per campo e codici di errore
// del database. Il messaggio del DB non esce mai al client (può contenere valori inseriti).

// Codice SQLSTATE (es. 23505, 23503, 23514) o il codice di dominio (P0001 con messaggio).
export function dbErrorCode(error: unknown): { sqlstate: string; message: string | null } {
  const cause = (error as { cause?: { code?: unknown; message?: unknown } } | null)?.cause;
  const direct = error as { code?: unknown; message?: unknown } | null;
  const sqlstate = cause?.code ?? direct?.code;
  const message = cause?.message ?? direct?.message;
  return {
    sqlstate: typeof sqlstate === "string" ? sqlstate : "unknown",
    message: typeof message === "string" ? message : null,
  };
}

// Campi non vuoti in testo: una stringa vuota diventa null, altrimenti il valore senza spazi ai bordi.
export function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
