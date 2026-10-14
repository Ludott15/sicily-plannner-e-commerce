import "server-only";
import { sql } from "drizzle-orm";
import { dbAsUser, type DbUser } from "@/server/db/user";

// Evento di ricerca voli (user_events, tipo flight_search). Si registra solo con un utente
// (account o ospite) e con il consenso ai cookie non tecnici. È best effort: un errore non
// interrompe la ricerca.

export async function recordFlightSearch(input: {
  user: DbUser | null;
  consented: boolean;
  itineraryId: string | null;
}): Promise<void> {
  const user = input.user;
  if (!user || !input.consented) return;
  const itineraryId = input.itineraryId;
  try {
    await dbAsUser(user, (tx) =>
      // L'itinerario arriva dall'URL: si registra solo se l'utente può vederlo (la policy di
      // user_events controlla solo user_id), altrimenti l'evento resta senza itinerario.
      tx.execute(sql`
        insert into public.user_events (user_id, type, itinerary_id)
        select ${user.id}, 'flight_search',
          case when ${itineraryId}::uuid is not null and public.can_access_itinerary(${itineraryId}::uuid)
            then ${itineraryId}::uuid
            else null end`),
    );
  } catch {
    // Il tracciamento non deve far fallire la pagina.
  }
}
