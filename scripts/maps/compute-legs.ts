// npm run maps:legs [limite]: calcola a mano le tratte stradali mancanti, come il cron route-legs
// ma con un limite più alto (default 200) e senza tetto di tempo. Va eseguito con
// tsx --conditions=react-server, come nello script di package.json: i moduli server importano
// "server-only", che sotto quella condizione è vuoto.
// Le variabili (DATABASE_URL, ROUTING_URL) si leggono da .env.local prima di importare il database.

import { config } from "dotenv";

const DEFAULT_LIMIT = 200;

async function main(): Promise<void> {
  config({ path: ".env.local", quiet: true });
  const limit = Number(process.argv[2] ?? DEFAULT_LIMIT);
  const { computeMissingLegs } = await import("../../src/server/maps/legs.admin");
  const { closeConnection } = await import("../../src/server/db/admin");
  try {
    const result = await computeMissingLegs(limit, { budgetMs: Number.POSITIVE_INFINITY });
    console.log(`tratte calcolate: ${result.computed}, non riuscite: ${result.failed}`);
  } finally {
    await closeConnection();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
