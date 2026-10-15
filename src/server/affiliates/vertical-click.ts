import "server-only";
import { sql } from "drizzle-orm";
import { dbPublic } from "@/server/db/public";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";
import type { VerticalContext } from "./vertical-links";

// Registra un click verso alloggi o noleggi con record_vertical_click (SQL, SECURITY DEFINER):
// verifica partner attivo, verticale ammessa, subid, contesto, host e itinerario, scrive in
// affiliate_clicks e restituisce il subid. Con utente si usa dbAsUser (RLS e auth.uid()), senza
// utente dbPublic. Gli errori di dominio danno false: la route non segue l'URL.

export type VerticalClickInput = {
  user: DbUser | null;
  partner: string;
  vertical: string;
  subId: string;
  context: VerticalContext;
  targetUrl: string;
  anonId: string | null;
  itineraryId: string | null;
};

export async function recordVerticalClick(input: VerticalClickInput): Promise<boolean> {
  const run = <T>(fn: (tx: UserTx) => Promise<T>) => (input.user ? dbAsUser(input.user, fn) : dbPublic(fn));
  try {
    const [row] = await run((tx) =>
      tx.execute<{ subid: string | null }>(
        sql`select public.record_vertical_click(${input.partner}::public.partner, ${input.vertical}, ${input.subId}, ${input.context}, ${input.targetUrl}, ${input.user ? null : input.anonId}, ${input.itineraryId}) as subid`,
      ),
    );
    return row?.subid === input.subId;
  } catch {
    return false;
  }
}
