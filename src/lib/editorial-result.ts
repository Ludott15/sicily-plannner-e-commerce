import type { AdminErrorCode } from "@/lib/admin-form";

// Esito delle azioni dell'admin editoriale (guide e descrizioni delle aree). Non cambia pagina:
// il componente mostra l'esito e resta sul form.
export type EditorialResult = { status: "ok"; id?: string } | { status: "error"; code: AdminErrorCode };

// Codice Postgres dell'errore, anche quando il driver lo nasconde in `cause`.
function postgresCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return postgresCode(error.cause);
  return undefined;
}

// Traduce un errore del database nel codice del form: slug già usato, vincolo violato, altro.
export function databaseErrorCode(error: unknown): AdminErrorCode {
  const code = postgresCode(error);
  if (code === "23505") return "slug_taken";
  if (code === "23503" || code === "23514" || code === "22P02") return "invalid";
  return "failed";
}
