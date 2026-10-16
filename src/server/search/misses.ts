import "server-only";
import { sql } from "drizzle-orm";
import { dbPublic } from "@/server/db/public";
import { allowSearchRequest, MISS_RATE_RULE } from "./rate-limit";
import { normalizeSearchQuery } from "./model";

// Registra una ricerca senza risultati (passo 11.2). Conta solo la frase normalizzata: nessun utente,
// nessun IP, nessun testo oltre la query. Chiamata solo dalla pagina /cerca, non dai suggerimenti.
// Oltre il limite per IP, o in caso di errore, la ricerca va avanti lo stesso: è solo statistica.
export async function recordSearchMiss(query: string, headers: Headers): Promise<void> {
  const normalized = normalizeSearchQuery(query);
  if (normalized === "") return;
  if (!(await allowSearchRequest(headers, MISS_RATE_RULE))) return;
  try {
    await dbPublic((tx) => tx.execute(sql`select public.record_search_miss(${normalized})`));
  } catch {
    // Il contatore non è essenziale: un errore non interrompe la pagina di ricerca.
  }
}
