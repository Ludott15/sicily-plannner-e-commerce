import "server-only";
import { connection } from "./connection";

// Ruolo postgres: bypassa la RLS. Consentito solo in app/api/cron, app/api/stripe,
// area (admin) e file src/server/**/*.admin.ts (regola ESLint in eslint.config.mjs).
export const dbAdmin = connection;
