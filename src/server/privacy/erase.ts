import "server-only";
import { sql } from "drizzle-orm";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { createClient } from "@/server/supabase/server";

// Eliminazione dell'account e dei dati (passo 8.2). Chi chiama ha già verificato l'identità: il
// codice email per gli account, nessuna verifica per gli ospiti (non hanno email).
// Ordine: prima i dati, con dbAsUser e la funzione SECURITY DEFINER delete_my_account (gruppi,
// recensioni senza autore, cascade su auth.users); poi la sessione locale, che il server rimuove
// anche se l'account non esiste più (scope local, nessuna chiamata di rete).
export async function eraseAccount(user: DbUser): Promise<void> {
  await dbAsUser(user, (tx) => tx.execute(sql`select public.delete_my_account()`));
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
}
