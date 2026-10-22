import { expect, test } from "@playwright/test";

// Pagine delle verticali (/traghetti, /barche, ...) e hub /servizi. Ogni pagina si apre senza "in arrivo".
// La ricerca produce un link firmato verso /api/go/v, oppure un messaggio onesto se il partner non è
// attivo (in CI non ci sono né il segreto dei link né gli ID dei partner: il ramo del link si verifica
// solo con E2E_AFFILIATE_READY=1). Il redirect verso il partner si prova solo in quel caso.

const PAGES = [
  "/it/dove-dormire",
  "/it/noleggio-auto",
  "/it/traghetti",
  "/it/treni-e-bus",
  "/it/transfer",
  "/it/musei-e-biglietti",
  "/it/barche",
  "/it/assicurazione-viaggio",
  "/it/esim",
  "/it/deposito-bagagli",
  "/it/servizi",
];

test("ogni pagina delle verticali si apre con il titolo e senza 'in arrivo'", async ({ page }) => {
  test.setTimeout(120_000);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator("h1").first(), path).toBeVisible();
    await expect(page.getByText("In arrivo", { exact: true }), path).toHaveCount(0);
    await expect(page.locator('[data-pending-id]'), path).toHaveCount(0);
  }
});

test("hub /servizi: le card portano alle pagine delle verticali", async ({ page }) => {
  await page.goto("/it/servizi");
  for (const href of ["/it/dove-dormire", "/it/noleggio-auto", "/it/traghetti", "/it/treni-e-bus", "/it/transfer", "/it/barche", "/it/musei-e-biglietti", "/it/assicurazione-viaggio", "/it/esim", "/it/deposito-bagagli"]) {
    await expect(page.locator(`main a[href="${href}"]`).first(), href).toBeVisible();
  }
});

test("traghetti: la ricerca compilata produce un link firmato o un avviso onesto", async ({ page }) => {
  await page.goto("/it/traghetti?da=milazzo&a=trapani&data=2027-05-01&passeggeri=2");
  await expect(page.getByText("La tua ricerca", { exact: true })).toBeVisible();

  const signed = page.locator('a[href*="/api/go/v"]');
  const unavailable = page.getByRole("alert").filter({ hasText: "Questo collegamento non è disponibile" });
  await expect(signed.or(unavailable)).toHaveCount(1);
  if (await signed.count()) {
    await expect(signed.first()).toHaveAttribute("rel", /sponsored/);
    await expect(signed.first()).toHaveAttribute("href", /[?&]s=/);
  }
});

test("traghetti: partenza uguale all'arrivo non produce link", async ({ page }) => {
  await page.goto("/it/traghetti?da=milazzo&a=milazzo&data=2027-05-01");
  await expect(page.locator('a[href*="/api/go/v"]')).toHaveCount(0);
  await expect(page.getByText("Partenza e arrivo non possono coincidere.")).toBeVisible();
});

test("dove-dormire: senza filtro per tipo nel partner, niente chip e il tipo non compare nel riepilogo", async ({ page }) => {
  // Booking non ha una mappa di filtri per tipo (KIND_FILTER vuota): il tipo non arriva al partner.
  await page.goto("/it/dove-dormire?tipo=ostello");
  await expect(page.locator('nav a[aria-current="true"]')).toHaveCount(0);
  await expect(page.locator("form[method='get'] input[name='tipo']")).toHaveCount(0);
  await expect(page.getByText("Ostello", { exact: true })).toHaveCount(0);
});

test("con il partner attivo il redirect di /api/go/v va verso l'host del partner", async ({ page, request }) => {
  test.skip(process.env.E2E_AFFILIATE_READY !== "1", "richiede segreto dei link e partner attivo (E2E_AFFILIATE_READY=1)");
  await page.goto("/it/traghetti?da=milazzo&a=trapani&data=2027-05-01&passeggeri=2");
  const href = await page.locator('a[href*="/api/go/v"]').first().getAttribute("href");
  expect(href).not.toBeNull();
  const res = await request.get(href!, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()["location"]).toMatch(/^https:\/\//);
});
