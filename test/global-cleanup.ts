import { cleanTestData, testDatabase } from "../scripts/db/clean-test-data.mjs";

// Prima e dopo la suite: elimina i dati di test rimasti (anche da suite interrotte).
async function clean() {
  const sql = testDatabase();
  try {
    await cleanTestData(sql);
  } finally {
    await sql.end();
  }
}

export default async function setup() {
  await clean();
  return clean;
}
