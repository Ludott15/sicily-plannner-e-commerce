import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/server/db/admin";

// Ospiti inattivi da GUEST_RETENTION_DAYS giorni: li elimina la funzione SQL
// delete_inactive_guests, con i loro dati (cascade). Solo per il cron.
export const GUEST_RETENTION_DAYS = 30;

export async function deleteInactiveGuests(days = GUEST_RETENTION_DAYS): Promise<number> {
  const [row] = await dbAdmin.execute<{ deleted: number }>(
    sql`select public.delete_inactive_guests(${days}) as deleted`,
  );
  return Number(row?.deleted ?? 0);
}
