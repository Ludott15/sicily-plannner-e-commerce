// Costanti dell'area privacy (passo 8.2). Nessun accesso al database: si importano ovunque.

// Frase da digitare per eliminare l'account (per lingua). Il confronto è esatto.
export function deleteConfirmationFor(locale: string): string {
  return locale === "en" ? "DELETE" : "ELIMINA";
}

// Download dei propri dati: al massimo N esportazioni per utente nella finestra (rate limit fisso).
export const EXPORT_DAILY_LIMIT = 5;
export const EXPORT_WINDOW_SECONDS = 24 * 60 * 60;

// Eliminazione dei dati dell'ospite (senza codice): tentativi al giorno per utente.
export const GUEST_DELETE_DAILY_LIMIT = 3;
