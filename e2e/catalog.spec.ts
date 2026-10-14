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

test("scheda attività: offerte dei partner dalla più economica, prezzo in loco nei metadati", async ({ page }) => {
  // demo-zingaro: ingresso di 5 € (metadato) e due offerte, GetYourGuide da 45 € e Viator da 52 €.
  await page.goto("/it/attivita/demo-zingaro");
  await expect(page.getByText("ingresso 5 € in loco")).toBeVisible();
  const offers = page.locator("aside .is-offer");
  await expect(offers).toHaveCount(2);
  await expect(offers.first()).toContainText("[DEMO] Escursione guidata nella Riserva dello Zingaro");
  await expect(offers.first()).toContainText("45 €");
  await expect(offers.first().getByRole("link", { name: "Vedi disponibilità su GetYourGuide" })).toHaveAttribute(
    "href",
    /^\/api\/go\/[0-9a-f-]{36}\?c=page&l=it$/,
  );
  await expect(offers.first()).toContainText("Prenoti sul sito di GetYourGuide. Riceviamo una commissione");
  await expect(offers.nth(1)).toContainText("Prenoti sul sito di Viator.");
});

test("scheda attività senza offerte: nessuna offerta e nessun pulsante del partner", async ({ page }) => {
  await page.goto("/it/attivita/demo-valle-templi");
  await expect(page.locator(".is-offer")).toHaveCount(0);
  await expect(page.locator('a[href^="/api/go/"]')).toHaveCount(0);
});

test("scheda attività su mobile: la barra ha l'offerta principale e non copre il footer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/it/attivita/demo-zingaro");
  const bar = page.locator("div.fixed.bottom-0").filter({ has: page.getByRole("link", { name: "Aggiungi al viaggio" }) });
  await expect(bar.getByRole("link", { name: "Aggiungi al viaggio" })).toHaveAttribute("href", "/it/viaggi/aggiungi?attivita=demo-zingaro");
  const offer = bar.locator('a[href^="/api/go/"]');
  await expect(offer).toHaveCount(1);
  await expect(offer).toContainText("GetYourGuide");
  await expect(offer).toContainText("da 45 €");

  // Lo spazio in fondo arriva quando la barra è misurata: si scorre di nuovo a ogni tentativo.
  const footer = page.locator("footer").last();
  await expect(async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const barBox = (await bar.boundingBox())!;
    const footerBox = (await footer.boundingBox())!;
    expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(barBox.y + 1);
  }).toPass();
});

test("liste e schede: niente Salva e Aggiungi finché non esistono; l'azione della scheda porta al viaggio", async ({ page }) => {
  for (const path of ["/it/attivita", "/it/luoghi/demo-trapani", "/it/attivita/demo-zingaro", "/it/itinerari/demo-sicilia-orientale"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: /^Salva/ }), path).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Aggiungi", exact: true }), path).toHaveCount(0);
    await expect(page.locator('[data-pending-id^="card."], [data-pending-id="activity.save"]'), path).toHaveCount(0);
  }
  // L'azione principale della pagina porta alla scelta del viaggio (M5).
  await page.goto("/it/attivita/demo-zingaro");
  await expect(page.getByRole("link", { name: "Aggiungi al viaggio" }).first()).toHaveAttribute("href", "/it/viaggi/aggiungi?attivita=demo-zingaro");

  await page.goto("/it");
  await expect(page.getByText("Esempio · Giorno 1")).toHaveCount(0);
  await expect(page.getByText("Per te", { exact: true })).toHaveCount(0);
});

test("home: hero con foto prioritaria senza didascalia e carosello con almeno quattro luoghi, tutta la card un link", async ({ page }) => {
  await page.goto("/it");

  // La foto dell'hero è a caso tra i luoghi in evidenza: si verifica la forma, non il luogo.
  const hero = page.locator("section").filter({ has: page.getByRole("heading", { level: 1 }) }).first();
  const heroImage = hero.locator("img");
  await expect(heroImage).toBeVisible();
  await expect(heroImage).toHaveAttribute("loading", "eager");
  await expect(hero.locator("figcaption")).toHaveCount(0);
  await expect(hero.getByText("Foto:")).toHaveCount(0);

  // Il carosello è in ordine casuale a ogni richiesta: non si testa l'ordine.
  await expect(page.getByRole("heading", { name: "Dove andare in Sicilia" })).toBeVisible();
  const list = page.getByRole("list", { name: "Dove andare in Sicilia" });
  const items = list.locator(":scope > li");
  const count = await items.count();
  expect(count).toBeGreaterThanOrEqual(4);
  await expect(list.locator('a[href^="/it/luoghi/"]')).toHaveCount(count);
  for (const item of await items.all()) {
    await expect(item.locator("a")).toHaveCount(1);
  }
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

test("consigli locali: firma e data di verifica nella scheda, accanto alla tappa e in home; gli scaduti no", async ({ page }) => {
  await page.goto("/it/attivita/demo-zingaro");
  const tip = page.getByRole("complementary", { name: "Consiglio locale" }).first();
  await expect(tip).toContainText("[DEMO] Entra dall'ingresso di Scopello");
  await expect(tip).toContainText("Redazione di Isula");
  await expect(tip).toContainText(/Verificato a \w+ \d{4}/);

  await page.goto("/it/itinerari/demo-sicilia-orientale");
  await expect(page.locator("ol.is-route").getByText("[DEMO] Arriva prima delle 8")).toBeVisible();

  await page.goto("/it");
  await expect(page.getByRole("heading", { name: "Consigli firmati, con la data di verifica" })).toBeVisible();
  await expect(page.getByText("Consiglio scaduto")).toHaveCount(0);
});
