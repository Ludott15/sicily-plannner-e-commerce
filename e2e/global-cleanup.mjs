import { cleanTestData, testDatabase } from "../scripts/db/clean-test-data.mjs";

// Usato come globalSetup e globalTeardown: elimina i dati creati dagli e2e
// (utenti e2e-…@example.com, contenuti con slug o titolo e2e-).
export default async function cleanup() {
  const sql = testDatabase();
  try {
    await cleanTestData(sql);
  } finally {
    await sql.end();
  }
}
