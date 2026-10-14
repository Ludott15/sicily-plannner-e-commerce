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
