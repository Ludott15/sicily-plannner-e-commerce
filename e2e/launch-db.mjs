// Controllo di lancio sul database di produzione (e2e/launch.spec.ts, PRE_LAUNCH=1): nessun
// dato demo del seed. È un file .mjs importato con import() dinamico, come e2e/db.mjs.
// LAUNCH_DATABASE_URL: connessione al database di produzione (basta un ruolo in sola lettura).
import postgres from "postgres";

// Righe demo per tabella: slug "demo-" (seed) e testi "[DEMO]".
export async function demoRowCounts(databaseUrl) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const [row] = await sql`
      select
        (select count(*)::int from public.activities where slug like 'demo-%' or description like '[DEMO]%') as activities,
        (select count(*)::int from public.places where slug like 'demo-%' or description like '[DEMO]%') as places,
        (select count(*)::int from public.itineraries where slug like 'demo-%' or title like '[DEMO]%') as itineraries,
        (select count(*)::int from public.local_tips where body like '[DEMO]%') as local_tips,
        (select count(*)::int from public.activity_offers where partner_product_id like 'demo-%' or title like '[DEMO]%') as activity_offers`;
    return row;
  } finally {
    await sql.end();
  }
}
