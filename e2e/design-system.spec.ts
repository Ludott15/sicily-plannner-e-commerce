import { expect, test } from "@playwright/test";

// Il layout globale usa token e font del design system (docs/design/tokens.json).
// Valori attesi: calce e lava nei due temi.
const THEMES = {
  light: { calce: "rgb(247, 242, 234)", lava: "rgb(31, 27, 24)" },
  dark: { calce: "rgb(23, 20, 18)", lava: "rgb(243, 236, 227)" },
} as const;

for (const scheme of ["light", "dark"] as const) {
  test.describe(`tema ${scheme === "light" ? "chiaro" : "scuro"}`, () => {
    test.use({ colorScheme: scheme });

    test("sfondo, testo e font del design system", async ({ page }) => {
      await page.goto("/it");
      const body = page.locator("body");
      await expect(body).toHaveCSS("background-color", THEMES[scheme].calce);
      await expect(body).toHaveCSS("color", THEMES[scheme].lava);
      await expect(body).toHaveCSS("font-family", /^"Instrument Sans"/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-family", /^Fraunces/);
      // SOFT 50 nei titoli display, mai opsz (sovrascriverebbe font-optical-sizing: auto).
      await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-variation-settings", '"SOFT" 50');
      await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-optical-sizing", "auto");
    });

    test("footer su superficie ink", async ({ page }) => {
      await page.goto("/it");
      // ink: #1f1b18 nel tema chiaro, #2a2420 nel tema scuro.
      await expect(page.locator("footer")).toHaveCSS(
        "background-color",
        scheme === "light" ? "rgb(31, 27, 24)" : "rgb(42, 36, 32)",
      );
    });
  });
}

test("data-theme forza il tema a prescindere dal sistema", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/it");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await expect(page.locator("body")).toHaveCSS("background-color", THEMES.dark.calce);
});

test("a 390px la home non scorre in orizzontale", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/it");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

// In CI gira la build di produzione: la pagina dei componenti non deve esistere.
test("/dev/design non esiste in produzione", async ({ request }) => {
  test.skip(!process.env.CI, "in locale gli e2e usano il server di sviluppo, dove la pagina esiste");
  expect((await request.get("/it/dev/design")).status()).toBe(404);
});
