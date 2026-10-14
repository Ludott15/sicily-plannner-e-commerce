import { expect, test } from "@playwright/test";

// Pagine pubbliche: sitemap, immagini di anteprima, Chi siamo e link affiliati, pagine legali,
// 404 e banner dei cookie.

test("sitemap: affiliazioni nelle due lingue; pagine con testi in sospeso, admin e profilo no", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("http://localhost:3000/it/affiliazioni");
  expect(sitemap).toContain("http://localhost:3000/en/affiliazioni");
  expect(sitemap).not.toContain("/link-affiliati");
  // Chi siamo e pagine legali hanno ancora il segnaposto: fuori dalla sitemap finché non sono scritte.
  for (const path of ["/chi-siamo", "/privacy", "/cookie", "/condizioni-di-vendita"]) {
    expect(sitemap, path).not.toContain(path);
  }
  expect(sitemap).not.toContain("/admin");
  expect(sitemap).not.toContain("/profilo");
});

test("pagine con testi in sospeso: noindex, \"Testo in preparazione\" e nessuna chiave di traduzione", async ({ page }) => {
  for (const path of ["/it/privacy", "/it/cookie", "/it/condizioni-di-vendita", "/it/chi-siamo", "/en/privacy"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute("content", /noindex/);
    await expect(page.locator("main")).toContainText(/Testo in preparazione|Text in preparation/);
    // Mai identificativi interni (legal.privacy, about.editorial…) né chiavi mancanti di next-intl.
    const text = (await page.locator("main").innerText()) + (await page.locator("footer").innerText());
    expect(text, path).not.toMatch(/\b(legal|about|home|activity)\.[a-z-]+\b/);
    expect(text, path).not.toMatch(/(Legal|Design|About)\./);
  }
  // Le pagine con testo vero restano indicizzabili.
  await page.goto("/it/affiliazioni");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("immagine di anteprima 1200×630 per attività, luoghi e itinerari", async ({ page, request }) => {
  for (const path of ["/it/attivita/demo-zingaro", "/it/luoghi/demo-trapani", "/it/itinerari/demo-sicilia-orientale"]) {
    await page.goto(path);
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image, path).toBeTruthy();
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
    const res = await request.get(image!);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    // Larghezza e altezza dall'intestazione IHDR del PNG.
    const png = await res.body();
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  }
});

test("Chi siamo dalla firma della redazione e dalla firma del fondatore in home", async ({ page }) => {
  await page.goto("/it/attivita/demo-zingaro");
  await page.getByRole("complementary", { name: "Consiglio locale" }).getByRole("link", { name: "Redazione di Isula" }).click();
  await expect(page).toHaveURL(/\/it\/chi-siamo$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chi siamo");

  await page.goto("/it");
  await page.getByRole("region", { name: "Consigli firmati, con la data di verifica" }).getByRole("link", { name: "Chi siamo" }).click();
  await expect(page).toHaveURL(/\/it\/chi-siamo$/);
});

test("pagine dal footer: link affiliati e informazioni legali in preparazione", async ({ page }) => {
  await page.goto("/it");
  const footer = page.getByRole("navigation", { name: "Piè di pagina" });
  await footer.getByRole("link", { name: "Link affiliati" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Come funzionano i link affiliati");

  for (const name of ["Privacy", "Cookie", "Condizioni di vendita"]) {
    await page.goto("/it");
    await page.getByRole("navigation", { name: "Piè di pagina" }).getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    // Testo legale non ancora scritto: segnaposto in sospeso che blocca il lancio.
    await expect(page.locator('[data-pending="legale"]')).toHaveText(/Testo in preparazione/);
  }
});

test("404 localizzata con le azioni per ripartire", async ({ page }) => {
  const it = await page.goto("/it/pagina-che-non-esiste");
  expect(it?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Qui non c'è niente");
  await expect(page.getByRole("link", { name: "Itinerari pronti" }).last()).toBeVisible();

  const en = await page.goto("/en/missing/page");
  expect(en?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing here");
});

test.describe("banner dei cookie", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Accetta e Rifiuta con la stessa evidenza, scelta ricordata, preferenze dal footer", async ({ page, context }) => {
    // Nessuna richiesta verso altri domini prima del consenso (font e script sono del sito).
    const external: string[] = [];
    page.on("request", (r) => {
      const host = new URL(r.url()).hostname;
      if (host !== "localhost" && host !== "127.0.0.1") external.push(r.url());
    });

    await page.goto("/it");
    const banner = page.getByRole("region", { name: "Cookie" });
    await expect(banner).toBeVisible();
    const accept = banner.getByRole("button", { name: "Accetta" });
    const reject = banner.getByRole("button", { name: "Rifiuta" });
    expect(await accept.getAttribute("class")).toBe(await reject.getAttribute("class"));
    const [a, r] = [(await accept.boundingBox())!, (await reject.boundingBox())!];
    expect(Math.round(a.width)).toBe(Math.round(r.width));
    expect(Math.round(a.height)).toBe(Math.round(r.height));
    expect(external).toEqual([]);

    await reject.click();
    await expect(banner).toBeHidden();
    expect((await context.cookies()).find((c) => c.name === "cookie_consent")?.value).toBe("rejected");
    await page.reload();
    await expect(page.getByRole("region", { name: "Cookie" })).toBeHidden();

    await page.getByRole("button", { name: "Preferenze cookie" }).click();
    await expect(page.getByRole("region", { name: "Cookie" })).toBeVisible();
    await page.getByRole("region", { name: "Cookie" }).getByRole("button", { name: "Accetta" }).click();
    expect((await context.cookies()).find((c) => c.name === "cookie_consent")?.value).toBe("accepted");
  });
});
