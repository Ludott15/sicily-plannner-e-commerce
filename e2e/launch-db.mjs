// Controllo di lancio sul database di produzione (e2e/launch.spec.ts, PRE_LAUNCH=1): nessun
// dato demo del seed né di test. È un file .mjs importato con import() dinamico, come e2e/db.mjs.
// LAUNCH_DATABASE_URL: connessione al database di produzione (basta un ruolo in sola lettura).
import postgres from "postgres";

// Prefissi dei dati che non devono esistere in produzione: "demo-" e "[DEMO]" (seed), "e2e-" e
// "int-" (test). Si guardano slug, titoli, testi e codici dei partner.
const PREFIXES = ["demo-%", "e2e-%", "int-%", "[DEMO]%"];

export async function demoRowCounts(databaseUrl) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const [row] = await sql`
      select
        (select count(*)::int from public.activities
          where slug like any(${PREFIXES}) or title like any(${PREFIXES}) or description like any(${PREFIXES})) as activities,
        (select count(*)::int from public.places
          where slug like any(${PREFIXES}) or name like any(${PREFIXES}) or description like any(${PREFIXES})) as places,
        (select count(*)::int from public.itineraries
          where slug like any(${PREFIXES}) or title like any(${PREFIXES})) as itineraries,
        (select count(*)::int from public.local_tips where body like any(${PREFIXES})) as local_tips,
        (select count(*)::int from public.local_tip_authors where display_name like any(${PREFIXES})) as local_tip_authors,
        (select count(*)::int from public.activity_offers
          where partner_product_id like any(${PREFIXES}) or title like any(${PREFIXES})) as activity_offers`;
    return row;
  } finally {
    await sql.end();
  }
}
