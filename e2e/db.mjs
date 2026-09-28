// Accesso diretto al database locale per gli e2e (promuovere un admin, verificare righe).
// È un file .mjs importato con import() dinamico: Playwright compila gli spec TypeScript
// in CommonJS, che non può importare staticamente un modulo ES.
import { testDatabase } from "../scripts/db/clean-test-data.mjs";

export async function withDb(fn) {
  const sql = testDatabase();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}
