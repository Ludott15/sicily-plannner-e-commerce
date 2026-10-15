// Stato e codici delle proposte di aggiunta e delle sostituzioni (passo 4.2). Nessuna dipendenza dal
// server: il file è importabile anche dai componenti client (solo tipi, costanti e una funzione pura).

export const PROPOSAL_ERROR_CODES = [
  "invalid",
  "failed",
  "guest_not_allowed",
  "not_group_owner",
  "not_group_member",
  "proposal_not_pending",
  "day_out_of_range",
  "activity_not_available",
] as const;

export type ProposalErrorCode = (typeof PROPOSAL_ERROR_CODES)[number];

export type ProposalFormState = { status: "idle" } | { status: "ok" } | { status: "error"; code: ProposalErrorCode };

const DOMAIN_CODES: ReadonlySet<string> = new Set<string>(
  PROPOSAL_ERROR_CODES.filter((code) => code !== "invalid" && code !== "failed"),
);

// Codice dell'errore: P0001 con un messaggio di dominio dà quel codice; 42501 (RLS) dà
// not_group_member; il resto è failed. Drizzle avvolge l'errore di Postgres in `cause`: si scende.
export function proposalErrorCodeOf(error: unknown): ProposalErrorCode {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const { code, message, cause } = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (code === "P0001" && typeof message === "string" && DOMAIN_CODES.has(message)) {
      return message as ProposalErrorCode;
    }
    if (code === "42501") return "not_group_member";
    current = cause;
  }
  return "failed";
}
