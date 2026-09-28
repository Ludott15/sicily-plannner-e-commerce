import { expect, test } from "@playwright/test";
import { waitForMagicLink } from "./helpers";

test("login con magic link, profilo protetto e logout", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.com`;

  // Senza sessione il profilo rimanda al login.
  await page.goto("/it/profilo");
  await expect(page).toHaveURL(/\/it\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Inviami il link" }).click();
  await expect(page.getByRole("status")).toContainText(email);

  await page.goto(await waitForMagicLink(request, email));
  await expect(page).toHaveURL(/\/it\/profilo$/);
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/it$/);
  await expect(page.getByRole("link", { name: "Accedi" })).toBeVisible();

  await page.goto("/it/profilo");
  await expect(page).toHaveURL(/\/it\/login$/);
});

test("il callback rifiuta redirect esterni", async ({ page }) => {
  await page.goto("/api/auth/callback?next=//evil.com");
  await expect(page).toHaveURL(/localhost:3000\/it\/login\?error=callback$/);
});
