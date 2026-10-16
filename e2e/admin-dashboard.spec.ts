import { expect, test } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Dashboard admin (passo 10.1): la home dell'area admin mostra i numeri del periodo. La protezione
// è nel layout dell'area: per chi non è admin la pagina risponde 404.

test("admin: la home mostra i numeri del periodo", async ({ page, request }) => {
  const email = await signUpWithCode(page, request);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);

  await page.goto("/it/admin");
  await expect(page.getByRole("heading", { name: "Numeri del periodo" })).toBeVisible();
});

test("un utente che non è admin riceve 404 sulla home dell'area admin", async ({ page, request }) => {
  await signUpWithCode(page, request);
  const response = await page.goto("/it/admin");
  expect(response?.status()).toBe(404);
});
