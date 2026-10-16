import { expect, test } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Import partner (passo 3.2): la pagina è solo per gli admin; i cron di import ed embedding
// rispondono 401 senza Authorization. In e2e le chiavi dei partner non sono impostate.

test("un utente che non è admin riceve 404 su Import partner", async ({ page, request }) => {
  await signUpWithCode(page, request);
  const res = await page.goto("/it/admin/import-partner");
  expect(res?.status()).toBe(404);
});

test("i cron di import ed embedding rispondono 401 senza Authorization", async ({ request }) => {
  expect((await request.get("/api/cron/import-catalog")).status()).toBe(401);
  expect((await request.get("/api/cron/embed-activities")).status()).toBe(401);
});

test("admin: la pagina mostra i partner non configurati, senza Esegui ora", async ({ page, request }) => {
  const email = await signUpWithCode(page, request);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);

  await page.goto("/it/admin/import-partner");
  await expect(page.getByRole("heading", { level: 1, name: "Import partner" })).toBeVisible();
  for (const partner of ["viator", "getyourguide"]) {
    const section = page.locator(`[data-partner="${partner}"]`);
    await expect(section).toContainText("Manca la chiave API nell'ambiente");
    await expect(section.getByRole("button", { name: "Esegui ora" })).toHaveCount(0);
  }
});
