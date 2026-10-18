import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/server/db/admin";
import { isRetentionJob, RETENTION, type RetentionJob } from "./retention";

// Esecuzione della conservazione (cron /api/cron/retention). Ruolo postgres: la funzione
// apply_retention non è eseguibile dai ruoli applicativi. Restituisce solo i conteggi, mai i dati.

export type RetentionOutcome = { job: RetentionJob; changed: number }[];

export async function runRetention(config: typeof RETENTION = RETENTION): Promise<RetentionOutcome> {
  // Il jsonb passa come testo: con postgres.js un oggetto non cast-ato verrebbe codificato due volte.
  const payload = JSON.stringify(config);
  const rows = await dbAdmin.execute<{ job_name: string; row_count_out: number | string }>(sql`
    select job_name, row_count_out from public.apply_retention(${payload}::text::jsonb)`);

  const outcome: RetentionOutcome = [];
  for (const row of rows) {
    if (!isRetentionJob(row.job_name)) throw new Error("retention_job_unknown");
    outcome.push({ job: row.job_name, changed: Number(row.row_count_out) });
  }
  return outcome;
}
