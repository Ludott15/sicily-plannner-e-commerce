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

test("nessun testo tra parentesi quadre dei mockup nelle pagine", async ({ request }) => {
  for (const path of ["/it", "/it/attivita", "/it/attivita/demo-zingaro", "/it/itinerari", "/it/itinerari/demo-sicilia-orientale", "/it/luoghi/demo-trapani"]) {
    const html = await (await request.get(path)).text();
    const body = html.slice(html.indexOf("<body"));
    // I titoli del seed iniziano con [DEMO]: sono dati di prova, non segnaposto dei mockup.
    const placeholders = body.replace(/\[DEMO\]/g, "").match(/\[(?:Foto|€|Partner|Nome|Durata|durata|PREZZO|mese anno|km|distanza)[^\]]*\]/g);
    expect(placeholders, path).toBeNull();
  }
});

test("elenco attività, scheda e pagina del luogo", async ({ page }) => {
  await page.goto("/it/attivita");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Attività in Sicilia");
  await page.getByRole("link", { name: "Street food al mercato di Ballarò" }).click();
  await expect(page).toHaveURL(/\/it\/attivita\/demo-mercato-ballaro$/);

  await page.getByRole("navigation", { name: "Percorso" }).getByRole("link", { name: "Palermo" }).click();
  await expect(page).toHaveURL(/\/it\/luoghi\/demo-palermo$/);
  await expect(page.getByRole("heading", { name: "Attività a Palermo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Visita al Teatro Massimo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Itinerari pronti che passano da qui" })).toBeVisible();
});

test("scheda attività: offerta affiliata con il partner nominato e trasparenza", async ({ page }) => {
  await page.goto("/it/attivita/demo-zingaro");
  // Su desktop l'offerta sta nel riquadro laterale; la copia nel contenuto è per il mobile.
  const offer = page.getByRole("link", { name: "Vedi disponibilità su GetYourGuide" }).filter({ visible: true });
  await expect(offer).toHaveAttribute("href", /^\/api\/go\/[0-9a-f-]{36}\?c=page&l=it$/);
  await expect(
    page.getByText("Prenoti sul sito di GetYourGuide. Riceviamo una commissione").filter({ visible: true }),
  ).toBeVisible();
});

test("scheda attività senza link affiliato: nessuna offerta", async ({ page }) => {
  await page.goto("/it/attivita/demo-valle-templi");
  await expect(page.getByText("Vedi disponibilità su")).toHaveCount(0);
});

test("itinerario pronto giorno per giorno, con i titoli dei giorni", async ({ page }) => {
  await page.goto("/it/itinerari");
  await page.getByRole("link", { name: "[DEMO] Sicilia orientale in cinque giorni" }).click();
  await expect(page).toHaveURL(/\/it\/itinerari\/demo-sicilia-orientale$/);

  const days = page.getByRole("navigation", { name: "Giorni" }).getByRole("button");
  await expect(days).toHaveCount(5);
  await expect(days.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(days.nth(1)).toHaveText(/Giorno 2 · Etna/);
  // Il quinto giorno non ha un titolo: mostra i luoghi delle sue tappe.
  await expect(days.nth(4)).toHaveText(/Giorno 5 · Noto/);

  await days.nth(1).click();
  await expect(days.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("link", { name: "Escursione ai crateri sommitali dell'Etna" })).toBeVisible();
});

test("versione inglese: lang, interfaccia e canonical", async ({ page }) => {
  await page.goto("/en/attivita/demo-valle-templi");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "What to expect" })).toBeVisible();
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
