import "server-only";
import { sql } from "drizzle-orm";
import { dbPublic } from "@/server/db/public";

// Controllo di salute del database (passo 11.5): una query minima con il ruolo anonimo, che non legge
// nessuna tabella. Un DB che non risponde entro il limite conta come guasto, così l'uptime check vede
// il problema invece di aspettare.

export const HEALTH_DB_TIMEOUT_MS = 3000;

export type DatabaseHealth = "ok" | "error";

// Esito della query entro il tempo massimo. Qualsiasi errore o ritardo vale come "error".
export async function checkDatabase(
  probe: () => Promise<unknown> = () => dbPublic((tx) => tx.execute(sql`select 1`)),
  timeoutMs: number = HEALTH_DB_TIMEOUT_MS,
): Promise<DatabaseHealth> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const outcome = await Promise.race([probe().then(() => "ok" as const), timeout]);
    return outcome === "ok" ? "ok" : "error";
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}
