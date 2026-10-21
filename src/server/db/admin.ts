import "server-only";
import { connection } from "./connection";

// Ruolo postgres: bypassa la RLS. Consentito solo in app/api/cron, app/api/stripe,
// area (admin) e file src/server/**/*.admin.ts (regola ESLint in eslint.config.mjs).
export const dbAdmin = connection;

// Chiude la connessione (script a riga di comando: npm run maps:legs). Esportata qui perché
// gli script non importano src/server/db/connection direttamente.
export { closeConnection } from "./connection";
