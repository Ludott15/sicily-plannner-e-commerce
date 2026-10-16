import "server-only";
import { sql } from "drizzle-orm";
import { dbPublic } from "@/server/db/public";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";
import type { ClickContext } from "@/server/affiliates/go";

// Registra un click verso Aviasales con record_flight_click (SQL, SECURITY DEFINER): verifica
// subid, contesto, itinerario e allowlist della destinazione, scrive in affiliate_clicks e
// restituisce il subid: se coincide, si segue l'URL costruito dal server. Come per le attività,
// con utente si usa dbAsUser (RLS), senza utente dbPublic (ruolo anon). Errori di dominio (es.
// target_not_allowed) danno null.

export type FlightClickInput = {
  user: DbUser | null;
  subId: string;
  context: ClickContext;
  targetUrl: string;
  anonId: string | null;
  itineraryId: string | null;
};

export async function recordFlightClick(input: FlightClickInput): Promise<string | null> {
  const run = <T>(fn: (tx: UserTx) => Promise<T>) => (input.user ? dbAsUser(input.user, fn) : dbPublic(fn));
  try {
    const [row] = await run((tx) =>
      tx.execute<{ subid: string | null }>(
        sql`select public.record_flight_click(${input.subId}, ${input.context}, ${input.targetUrl}, ${input.user ? null : input.anonId}, ${input.itineraryId}) as subid`,
      ),
    );
    return row?.subid === input.subId ? input.targetUrl : null;
  } catch {
    return null;
  }
}
