import { expect, test } from "@playwright/test";

// Usano il seed demo (supabase/seed.sql), caricato da `supabase db reset` in locale e in CI.

test("le pagine del catalogo sono renderizzate lato server", async ({ request }) => {
  // Richiesta HTTP senza JavaScript: il contenuto deve essere già nell'HTML.
  const res = await request.get("/it/attivita/demo-valle-templi");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("<h1");
  expect(html).toContain("Valle dei Templi al tramonto");
  expect(html).toContain('"@type":"TouristAttraction"');
});

test("attività: titolo, descrizione, canonical, hreflang e dati strutturati", async ({ page }) => {
  await page.goto("/it/attivita/demo-valle-templi");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Valle dei Templi al tramonto");
  await expect(page).toHaveTitle("Valle dei Templi al tramonto · Agrigento · Isula");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /templi dorici/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "http://localhost:3000/it/attivita/demo-valle-templi",
  );
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    "href",
    "http://localhost:3000/en/attivita/demo-valle-templi",
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Valle dei Templi al tramonto");

  const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(data["@type"]).toBe("TouristAttraction");
  expect(data.location.address.addressRegion).toBe("AG");
});

test("elenco attività e pagina del luogo", async ({ page }) => {
  await page.goto("/it/attivita");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Attività in Sicilia");
  await page.getByRole("link", { name: "Street food al mercato di Ballarò" }).click();
  await expect(page).toHaveURL(/\/it\/attivita\/demo-mercato-ballaro$/);

  await page.getByRole("link", { name: "Palermo", exact: true }).first().click();
  await expect(page).toHaveURL(/\/it\/luoghi\/demo-palermo$/);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Attività a Palermo");
  await expect(page.getByRole("link", { name: "Visita al Teatro Massimo" })).toBeVisible();
});

test("itinerario predefinito giorno per giorno", async ({ page }) => {
  await page.goto("/it/itinerari");
  await page.getByRole("link", { name: "[DEMO] Sicilia orientale in cinque giorni" }).click();
  await expect(page).toHaveURL(/\/it\/itinerari\/demo-sicilia-orientale$/);
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "Giorno 2" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Escursione ai crateri sommitali dell'Etna" })).toBeVisible();
});

test("versione inglese: lang, interfaccia e canonical", async ({ page }) => {
  await page.goto("/en/attivita/demo-valle-templi");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("Duration")).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "http://localhost:3000/en/attivita/demo-valle-templi",
  );
});

test("slug inesistente: 404", async ({ request }) => {
  expect((await request.get("/it/attivita/demo-non-esiste")).status()).toBe(404);
  expect((await request.get("/it/luoghi/demo-non-esiste")).status()).toBe(404);
  expect((await request.get("/it/itinerari/demo-non-esiste")).status()).toBe(404);
});

test("sitemap e robots", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("http://localhost:3000/it/attivita/demo-valle-templi");
  expect(sitemap).toContain("http://localhost:3000/en/luoghi/demo-palermo");
  expect(sitemap).toContain("http://localhost:3000/it/itinerari/demo-weekend-palermo");

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap: http://localhost:3000/sitemap.xml");
  expect(robots).toContain("Disallow: /*/admin");
});
