import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/server/db/admin";
import { LEARN_EVENTS_PER_RUN, LEARNING_PARAMS } from "./config";

// Cron learn (M11, docs/spec.md "Passo 4, apprendimento"): pesi impliciti e embedding del profilo
// dagli eventi non processati. Ruolo postgres (dbAdmin): la funzione learn_from_events
// (supabase/migrations/20261016160438_learn.sql) non è eseguibile dai ruoli applicativi. Il decadimento si applica solo
// agli utenti che hanno eventi nuovi in questa esecuzione: rieseguirlo senza eventi nuovi non cambia nulla.

export type LearnOutcome = { users: number; events: number };

export async function runLearning(limit: number = LEARN_EVENTS_PER_RUN): Promise<LearnOutcome> {
  // Il jsonb passa come testo: con postgres.js un oggetto o una stringa non cast-ata verrebbe
  // codificata due volte (il valore letto nel database sarebbe una stringa JSON).
  const config = JSON.stringify(LEARNING_PARAMS);
  const rows = await dbAdmin.execute<{ users: number; events: number }>(sql`
    select users, events from public.learn_from_events(${config}::text::jsonb, ${limit}::int)`);
  const [row] = rows;
  return { users: Number(row?.users ?? 0), events: Number(row?.events ?? 0) };
}
