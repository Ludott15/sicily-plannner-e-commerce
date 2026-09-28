import { defineConfig, devices } from "@playwright/test";

// Richiede Supabase locale avviato (npm run db:start).
export default defineConfig({
  testDir: "./e2e",
  // Elimina i dati creati dai test (prefisso e2e-) prima e dopo la suite.
  globalSetup: "./e2e/global-cleanup.mjs",
  globalTeardown: "./e2e/global-cleanup.mjs",
  fullyParallel: true,
  // In locale il server di sviluppo compila le route al primo accesso: in parallelo le
  // navigazioni superano i timeout. In CI (build di produzione) si usa il default.
  workers: process.env.CI ? undefined : 1,
  // In locale la prima visita a una pagina la compila (anche 4-5 s): timeout più ampio.
  // In CI resta quello predefinito, sulla build di produzione.
  expect: process.env.CI ? undefined : { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000/it",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
