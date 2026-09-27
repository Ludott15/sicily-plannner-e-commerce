import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Accesso al database: dbAsUser ovunque (RLS applicata); dbAdmin (ruolo postgres)
// solo nei percorsi riservati; la connessione grezza solo dentro src/server/db.
// I pattern coprono sia l'alias @/server/db/... sia gli import relativi.
const connectionRestriction = {
  paths: [
    { name: "postgres", message: "Usa dbAsUser o dbAdmin da @/server/db." },
    { name: "drizzle-orm/postgres-js", message: "Usa dbAsUser o dbAdmin da @/server/db." },
  ],
  patterns: [{ group: ["**/db/connection"], message: "Usa dbAsUser o dbAdmin." }],
};

const dbAdminMessage =
  "dbAdmin bypassa la RLS: consentito solo in app/api/cron, app/api/stripe, area (admin) e src/server/**/*.admin.ts. Altrove usa dbAsUser.";

const adminModuleMessage =
  "I file *.admin.ts girano con privilegi: importabili solo da api/cron, api/stripe, area (admin) e altri *.admin.ts. Per un'azione utente su dati riservati usa una funzione SQL SECURITY DEFINER chiamata con dbAsUser.";

// Fuori dai percorsi riservati: niente dbAdmin e niente moduli *.admin.ts.
const adminRestriction = {
  paths: connectionRestriction.paths,
  patterns: [
    ...connectionRestriction.patterns,
    { group: ["**/db/admin"], message: dbAdminMessage },
    { group: ["**/*.admin", "**/*.admin.ts"], message: adminModuleMessage },
  ],
};

// Il client Supabase resta per auth e realtime: le query dati passano da Drizzle.
// getSession() legge il cookie senza verificarlo: sul server si usa getUser() o getClaims().
const noSupabaseDataQueries = [
  "error",
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(from|rpc)$/][callee.object.name=/^supabase/]",
    message: "Query dati via Drizzle (dbAsUser/dbAdmin); il client Supabase serve solo per auth e realtime.",
  },
  {
    selector: "CallExpression[callee.property.name='getSession']",
    message: "getSession() non verifica il token: usa getUser() (in @/server/auth) o getClaims().",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", adminRestriction],
      "no-restricted-syntax": noSupabaseDataQueries,
    },
  },
  {
    files: [
      "src/app/api/cron/**",
      "src/app/api/stripe/**",
      "src/app/\\[locale\\]/\\(admin\\)/**",
      "src/server/**/*.admin.ts",
      "src/**/*.int.test.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", connectionRestriction],
    },
  },
  {
    files: ["src/server/db/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
