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

test("scheda attività: nessuna offerta affiliata fino allo schema 2e, il prezzo in loco è un metadato", async ({ page }) => {
  // demo-zingaro ha un link affiliato e un ingresso di 5 €: l'ingresso non è un'offerta.
  await page.goto("/it/attivita/demo-zingaro");
  await expect(page.getByText("ingresso 5 € in loco")).toBeVisible();
  await expect(page.getByText("Vedi disponibilità su")).toHaveCount(0);
  await expect(page.getByText("Riceviamo una commissione")).toHaveCount(0);
  await expect(page.locator('a[href^="/api/go/"]')).toHaveCount(0);
  await expect(page.locator('[data-pending-id="activity.offer"]')).toHaveAttribute("data-pending", "2e");
  await expect(page.locator('[data-pending-id="activity.offer"]')).toBeHidden();
});

test("scheda attività su mobile: la barra mostra solo \"Aggiungi al viaggio\" e non copre il footer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/it/attivita/demo-zingaro");
  const bar = page.locator("div.fixed.bottom-0").filter({ has: page.locator('[data-pending-id="activity.add-to-trip"]') });
  await expect(bar.getByRole("button")).toHaveCount(1);
  await expect(bar.getByRole("link")).toHaveCount(0);

  // Lo spazio in fondo arriva quando la barra è misurata: si scorre di nuovo a ogni tentativo.
  const footer = page.locator("footer").last();
  await expect(async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const barBox = (await bar.boundingBox())!;
    const footerBox = (await footer.boundingBox())!;
    expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(barBox.y + 1);
  }).toPass();
});

test("elenco attività: filtri per interesse e provincia nell'URL, lista renderizzata dal server", async ({ page, request }) => {
  // Senza JavaScript: l'URL basta a filtrare.
  const html = await (await request.get("/it/attivita?provincia=TP")).text();
  expect(html).toContain("Riserva dello Zingaro");
  expect(html).not.toContain("Visita al Teatro Massimo");
  const both = await (await request.get("/it/attivita?interessi=sea&provincia=TP")).text();
  expect(both).toContain("Riserva dello Zingaro");
  expect(both).not.toContain("Saline e mulini di Trapani");

  await page.goto("/it/attivita");
  const results = page.getByRole("list", { name: "Attività in Sicilia" });
  const all = await results.locator(":scope > li").count();
  await page.getByRole("button", { name: "Mare", exact: true }).click();
  await expect(page).toHaveURL(/\/it\/attivita\?interessi=sea$/);
  await expect(page.getByRole("button", { name: "Mare", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "Visita al Teatro Massimo" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Riserva dello Zingaro" })).toBeVisible();

  await page.getByLabel("Provincia").selectOption("TP");
  await expect(page).toHaveURL(/\/it\/attivita\?interessi=sea&provincia=TP$/);
  await expect(page.getByRole("link", { name: "Isola Bella in kayak" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Riserva dello Zingaro" })).toBeVisible();

  // Lo stato resta dopo il ricaricamento: viene dall'URL.
  await page.reload();
  await expect(page.getByRole("button", { name: "Mare", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Provincia")).toHaveValue("TP");

  await page.getByRole("button", { name: "Mare", exact: true }).click();
  await page.getByLabel("Provincia").selectOption("");
  await expect(page).toHaveURL(/\/it\/attivita$/);
  await expect(results.locator(":scope > li")).toHaveCount(all);
});

test("elenco attività: filtri senza risultati mostrano come uscirne", async ({ page }) => {
  // Nel seed l'unica attività della provincia di Enna è la Villa Romana del Casale, senza mare.
  await page.goto("/it/attivita?interessi=sea&provincia=EN");
  await expect(page.getByText("Con questi filtri non c'è ancora nessuna attività.")).toBeVisible();
  await page.getByRole("link", { name: "Togli i filtri" }).click();
  await expect(page).toHaveURL(/\/it\/attivita$/);
  await expect(page.getByRole("button", { name: "Mare", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("itinerario pronto: la linea del percorso finisce al centro dell'ultima tappa", async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/it/itinerari/demo-sicilia-orientale");
    const route = page.locator("ol.is-route").first();
    await expect(async () => {
      const { lineStart, lineEnd, firstDot, lastDot } = await route.evaluate((list) => {
        const box = list.getBoundingClientRect();
        const line = getComputedStyle(list, "::before");
        const dots = [...list.querySelectorAll(".is-stop__dot")].map((d) => {
          const r = d.getBoundingClientRect();
          return r.top + r.height / 2 - box.top;
        });
        return {
          lineStart: parseFloat(line.top),
          lineEnd: box.height - parseFloat(line.bottom),
          firstDot: dots[0]!,
          lastDot: dots[dots.length - 1]!,
        };
      });
      expect(Math.abs(lineStart - firstDot), `inizio a ${width}px`).toBeLessThanOrEqual(1);
      expect(Math.abs(lineEnd - lastDot), `fine a ${width}px`).toBeLessThanOrEqual(1);
    }).toPass();
  }
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
