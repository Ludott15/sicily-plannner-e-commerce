import { expect, test } from "@playwright/test";

// SEO e contenuti editoriali (passo 11.1): sitemap divise per tipo con hreflang, robots che le elenca,
// guida demo pubblicata con autore e dati strutturati Article, bozze invisibili ai visitatori,
// pagina di area, canonical senza filtri. I dati di prova arrivano dal seed demo (prefisso demo-)
// oppure, per la bozza, da una riga e2e- che db:clean rimuove.

type DemoGuide = { slug: string; title_it: string; author_name: string };
type DemoArea = { slug: string; name_it: string };

async function demoGuide(): Promise<DemoGuide | undefined> {
  const { withDb } = await import("./db.mjs");
  const rows = await withDb(
    (sql) =>
      sql`select slug, title_it, author_name from public.guides
          where slug like 'demo-%' and status = 'published'
          order by published_at desc limit 1`,
  );
  return rows[0] as DemoGuide | undefined;
}

async function demoArea(): Promise<DemoArea | undefined> {
  const { withDb } = await import("./db.mjs");
  const rows = await withDb((sql) => sql`select slug, name_it from public.areas order by sort limit 1`);
  return rows[0] as DemoArea | undefined;
}

test("sitemap per tipo con hreflang it ed en", async ({ request }) => {
  // Next 16 (generateSitemaps) non crea un indice in /sitemap.xml: ogni tipo ha la sua sitemap,
  // elencata in robots.txt.
  for (const id of ["pagine", "luoghi", "attivita", "itinerari", "aree", "guide", "voli"]) {
    const response = await request.get(`/sitemap/${id}.xml`);
    expect(response.ok(), id).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("xml");
    expect(await response.text()).toContain("<urlset");
  }

  const pages = await request.get("/sitemap/pagine.xml");
  expect(pages.ok()).toBeTruthy();
  const pagesXml = await pages.text();
  expect(pagesXml).toContain("<urlset");
  expect(pagesXml).toContain('hreflang="it"');
  expect(pagesXml).toContain('hreflang="en"');
});

test("robots.txt elenca le sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBeTruthy();
  const body = await response.text();
  for (const id of ["pagine", "luoghi", "attivita", "itinerari", "aree", "guide", "voli"]) {
    expect(body).toMatch(new RegExp(`^Sitemap: .*/sitemap/${id}\\.xml$`, "m"));
  }
});

test("guida demo: autore visibile e dati strutturati Article", async ({ page }) => {
  const guide = await demoGuide();
  expect(guide, "il seed demo contiene una guida pubblicata").toBeTruthy();

  await page.goto(`/it/guide/${guide!.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: guide!.title_it })).toBeVisible();
  await expect(page.getByText(guide!.author_name, { exact: false }).first()).toBeVisible();

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const parsed = blocks.map((block) => JSON.parse(block) as Record<string, unknown>);
  const article = parsed.find((data) => data["@type"] === "Article");
  expect(article).toBeTruthy();
  expect(article?.["@context"]).toBe("https://schema.org");
  expect(article?.headline).toBe(guide!.title_it);
});

test("bozza: 404 per i visitatori", async ({ page }) => {
  const { withDb } = await import("./db.mjs");
  const slug = `e2e-bozza-${Date.now()}`;
  await withDb(
    (sql) =>
      sql`insert into public.guides (slug, title_it, body_it, author_name, status)
          values (${slug}, ${"e2e-bozza"}, ${"Testo di prova."}, ${"e2e-redazione"}, 'draft')`,
  );

  const response = await page.goto(`/it/guide/${slug}`);
  expect(response?.status()).toBe(404);
});

test("pagina di area demo: titolo dell'area e canonical", async ({ page }) => {
  const area = await demoArea();
  expect(area, "il seed demo contiene almeno un'area").toBeTruthy();

  await page.goto(`/it/sicilia/${area!.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: area!.name_it })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/it/sicilia/${area!.slug}$`));
});

test("canonical senza filtri: /attivita con query punta alla pagina base", async ({ page }) => {
  await page.goto("/it/attivita?interessi=food_wine");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/it\/attivita$/);
});

test("voce Guide nel footer", async ({ page }) => {
  await page.goto("/it");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Guide", exact: true })).toHaveAttribute("href", "/it/guide");
});
