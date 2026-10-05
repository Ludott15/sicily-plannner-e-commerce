import { expect, test } from "@playwright/test";

// /api/go/[id]: click registrato con subid univoco, 302 verso il partner, mai un URL arbitrario.
// Le offerte non sono in pagina fino allo schema 2e: il link si costruisce come AffiliateOffer
// (affiliateHref) sull'attività demo con link affiliato.

async function offerHref() {
  const { withDb } = await import("./db.mjs");
  const [row] = await withDb((sql) => sql`select id from activity_offers where partner_product_id = 'demo-gyg-zingaro'`);
  expect(row).toBeTruthy();
  return `/api/go/${row!.id}?c=page&l=it`;
}

test("ogni click crea una riga con subid univoco e reindirizza al partner", async ({ request }) => {
  const href = await offerHref();
  const { withDb } = await import("./db.mjs");

  const subids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const res = await request.get(href, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = res.headers()["location"]!;
    expect(location.startsWith("https://www.getyourguide.com/s/?q=Riserva%20dello%20Zingaro&cmp=")).toBe(true);
    subids.push(new URL(location).searchParams.get("cmp")!);
  }
  expect(subids[0]).toMatch(/^[a-z0-9]{16}$/);
  expect(subids[0]).not.toBe(subids[1]);

  const rows = await withDb(
    (sql) => sql`select subid, context, partner::text as partner from affiliate_clicks where subid = any(${subids})`,
  );
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.context === "page" && r.partner === "getyourguide")).toBe(true);
  await withDb((sql) => sql`delete from affiliate_clicks where subid = any(${subids})`);
});

test("nessun open redirect: i parametri della richiesta non cambiano la destinazione", async ({ request }) => {
  const href = await offerHref();
  for (const extra of ["&url=https://evil.example", "&target=https://evil.example", "&l=https://evil.example"]) {
    const res = await request.get(`${href}${extra}`, { maxRedirects: 0 });
    const location = res.headers()["location"]!;
    expect(new URL(location).host, extra).toBe("www.getyourguide.com");
  }
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`delete from affiliate_clicks where target_url like 'https://www.getyourguide.com/s/?q=Riserva%'`);
});

test("offerta inesistente, spenta o id di un'attività: si torna al catalogo, nessun redirect esterno", async ({ request }) => {
  const { withDb } = await import("./db.mjs");
  const [activity] = await withDb((sql) => sql`select id from activities where slug = 'demo-zingaro'`);
  const notOffer = await request.get(`/api/go/${activity!.id}`, { maxRedirects: 0 });
  expect(notOffer.status()).toBe(303);
  expect(new URL(notOffer.headers()["location"]!).host).toBe("localhost:3000");

  const [offer] = await withDb(
    (sql) => sql`update activity_offers set is_active = false where partner_product_id = 'demo-viator-zingaro' returning id`,
  );
  try {
    const off = await request.get(`/api/go/${offer!.id}`, { maxRedirects: 0 });
    expect(off.status()).toBe(303);
    expect(new URL(off.headers()["location"]!).host).toBe("localhost:3000");
  } finally {
    await withDb((sql) => sql`update activity_offers set is_active = true where id = ${offer!.id}`);
  }

  const unknown = await request.get("/api/go/00000000-0000-0000-0000-000000000000", { maxRedirects: 0 });
  expect(unknown.status()).toBe(303);
  expect(new URL(unknown.headers()["location"]!).pathname).toBe("/it/attivita");

  const invalid = await request.get("/api/go/https%3A%2F%2Fevil.example", { maxRedirects: 0 });
  expect(new URL(invalid.headers()["location"]!).host).toBe("localhost:3000");
});
