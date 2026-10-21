import { expect, test } from "@playwright/test";

// Carosello "Dove andare in Sicilia" della home: usa il seed demo (luoghi in evidenza, almeno quattro).

test("carosello su desktop: le frecce scorrono la lista e si disabilitano agli estremi", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/it");

  const list = page.getByRole("list", { name: "Dove andare in Sicilia" });
  const prev = page.getByRole("button", { name: "Luoghi precedenti" });
  const next = page.getByRole("button", { name: "Luoghi successivi" });
  const scrollLeft = () => list.evaluate((el) => el.scrollLeft);

  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();
  expect(await scrollLeft()).toBe(0);

  await next.click();
  await expect.poll(scrollLeft).toBeGreaterThan(0);
  await expect(prev).toBeEnabled();

  // Fino in fondo: la freccia successiva si disabilita quando la lista è finita.
  await expect
    .poll(
      async () => {
        if (await next.isEnabled()) await next.click();
        return next.isDisabled();
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  await expect(next).toBeDisabled();
});

test("a 390 px la home non scorre in orizzontale e il carosello non mostra le frecce", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/it");

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole("button", { name: "Luoghi successivi" })).toBeHidden();
  await expect(page.getByRole("list", { name: "Dove andare in Sicilia" })).toBeVisible();
});

// Redesign della home e della navigazione (2026-10-20): sezioni in ordine, voce attiva, menu Servizi.
test("home e navigazione: sezioni del redesign, menu Servizi e voce attiva", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/it");

  await expect(page.getByRole("heading", { name: "Come funziona" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organizza il viaggio" })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Principale" });
  for (const name of ["Itinerari", "Attività", "Guide", "Shop"]) {
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await nav.getByRole("button", { name: "Servizi" }).click();
  for (const name of ["Voli", "Dove dormire", "Noleggio auto", "Traghetti", "Tutti i servizi"]) {
    await expect(page.getByRole("menuitem", { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");

  await page.goto("/it/attivita");
  await expect(
    page.getByRole("navigation", { name: "Principale" }).getByRole("link", { name: "Attività", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("mobile: la barra in basso apre Esplora, con le stesse voci dell'intestazione", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/it");

  await page.locator('a[href="/it/esplora"]').click();
  await expect(page).toHaveURL(/\/it\/esplora$/);
  await expect(page.getByRole("heading", { level: 1, name: "Esplora" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Itinerari", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
