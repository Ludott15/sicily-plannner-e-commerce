import { expect, test } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Tempi di guida tra aree (M4 parte 4): solo admin; l'admin salva un tempo, lo ritrova dopo il
// ricaricamento e lo toglie. La prima coppia della griglia torna com'era prima del test.

test("un utente che non è admin non vede i tempi di guida", async ({ page, request }) => {
  await signUpWithCode(page, request);
  const res = await page.goto("/it/admin/tempi-di-guida");
  expect(res?.status()).toBe(404);
});

test("admin: un tempo tra due aree si salva, si ritrova e si toglie", async ({ page, request }) => {
  const email = await signUpWithCode(page, request);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);

  const save = page.getByRole("button", { name: "Salva", exact: true });
  const firstPair = () => page.getByLabel(/^Minuti tra /).first();

  await page.goto("/it/admin/tempi-di-guida");
  const original = await firstPair().inputValue();

  await firstPair().fill("95");
  await save.click();
  await expect(page.getByRole("status")).toHaveText("Tempi di guida salvati.");

  await page.reload();
  await expect(firstPair()).toHaveValue("95");

  await firstPair().fill("");
  await save.click();
  await expect(page.getByRole("status")).toHaveText("Tempi di guida salvati.");

  await page.reload();
  await expect(firstPair()).toHaveValue("");

  if (original !== "") {
    await firstPair().fill(original);
    await save.click();
    await expect(page.getByRole("status")).toHaveText("Tempi di guida salvati.");
    await page.reload();
    await expect(firstPair()).toHaveValue(original);
  }
});
