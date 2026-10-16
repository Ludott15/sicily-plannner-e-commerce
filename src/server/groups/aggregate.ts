import "server-only";
import { sql } from "drizzle-orm";
import { parseGroupPreferences, type GroupPreferences } from "@/lib/group-profile";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";

// Preferenze aggregate del gruppo (passo 4.3). L'aggregazione avviene nel database, nella funzione
// SECURITY DEFINER public.group_preferences (supabase/migrations/20261015172033_preferenze_gruppo.sql): chi la chiama, se è membro,
// riceve solo valori aggregati, mai le preferenze di un singolo membro. Qui nessuna tabella dei
// gusti dei membri viene letta direttamente.

// Chiamata nella transazione di chi legge (ruolo authenticated e claim dell'utente).
export async function groupPreferencesTx(tx: UserTx, groupId: string): Promise<GroupPreferences> {
  const [row] = await tx.execute<{ prefs: unknown }>(sql`select public.group_preferences(${groupId}::uuid) as prefs`);
  const value: unknown = typeof row?.prefs === "string" ? JSON.parse(row.prefs) : row?.prefs;
  return parseGroupPreferences(value);
}

// Preferenze aggregate del gruppo per un membro. Lancia (not_group_member, guest_not_allowed, 42501)
// se chi chiama non può leggerle.
export function getGroupPreferences(user: DbUser, groupId: string): Promise<GroupPreferences> {
  return dbAsUser(user, (tx) => groupPreferencesTx(tx, groupId));
}
