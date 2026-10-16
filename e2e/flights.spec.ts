import { expect, test } from "@playwright/test";

// Voli (passo 2.1). Il redirect firmato si prova solo quando la pagina espone un link firmato
// (serve FLIGHT_LINK_SECRET nell'ambiente): senza, il test si salta con il motivo. Nessun secret
// viene aggiunto ai workflow.

const FUTURE = Math.floor(Date.now() / 1000) + 3600;

test("una firma alterata risponde 400 JSON, senza redirect", async ({ request }) => {
  const res = await request.get(
    `/api/go/flight?o=MXP&d=CTA&dep=2030-06-10&pax=2&c=flights&l=it&exp=${FUTURE}&s=firma-alterata`,
    { maxRedirects: 0 },
  );
  expect(res.status()).toBe(400);
  expect(res.headers()["location"]).toBeUndefined();
  expect(await res.json()).toEqual({ error: "invalid_signature" });
});

test("url e target esterni nella richiesta sono ignorati", async ({ request }) => {
  const res = await request.get(
    `/api/go/flight?url=https://evil.example/&target=https://evil.example/&o=MXP&d=CTA&dep=2030-06-10&pax=2&c=flights&exp=${FUTURE}&s=firma-alterata`,
    { maxRedirects: 0 },
  );
  expect(res.status()).toBe(400);
  expect(res.headers()["location"]).toBeUndefined();
  expect(await res.json()).toEqual({ error: "invalid_signature" });
});

test("la partenza si sceglie dalla tastiera", async ({ page }) => {
  await page.goto("/it/voli");
  const origin = page.getByRole("combobox", { name: "Partenza" });
  const list = page.getByRole("listbox", { name: "Aeroporti di partenza" });

  await origin.fill("Mil");
  await expect(list).toBeVisible();
  await origin.press("ArrowDown");
  await expect(origin).toHaveAttribute("aria-activedescendant", /.+/);
  await origin.press("Enter");
  await expect(origin).toHaveValue("Milano (MXP)");
  await expect(list).toBeHidden();
});

test("Esc chiude l'elenco delle partenze", async ({ page }) => {
  await page.goto("/it/voli");
  const origin = page.getByRole("combobox", { name: "Partenza" });
  await origin.fill("Ro");
  await expect(page.getByRole("listbox", { name: "Aeroporti di partenza" })).toBeVisible();
  await origin.press("Escape");
  await expect(page.getByRole("listbox", { name: "Aeroporti di partenza" })).toBeHidden();
});

test("una partenza siciliana mostra il messaggio e non cerca", async ({ page }) => {
  await page.goto("/it/voli");
  await page.getByRole("combobox", { name: "Partenza" }).fill("Catania");
  await expect(page.getByText(/già in Sicilia/)).toBeVisible();
  await page.getByRole("button", { name: "Cerca voli" }).click();
  await expect(page).toHaveURL(/\/it\/voli$/);
  // Next ha il suo annunciatore delle rotte con role="alert": si filtra sul messaggio.
  await expect(page.getByRole("alert").filter({ hasText: "Sei già in Sicilia" })).toBeVisible();
});

test("senza token i voli mostrano lo stato non configurato", async ({ page }) => {
  test.skip(Boolean(process.env.TRAVELPAYOUTS_TOKEN), "Con il token la ricerca arriva al fornitore: lo stato si vede solo senza.");
  await page.goto("/it/voli?da=MXP&a=CTA&andata=2030-06-10&persone=2");
  await expect(page.getByText("I prezzi dei voli non sono ancora disponibili")).toBeVisible();
});

test("il link firmato porta ad Aviasales e registra il click", async ({ page, request }) => {
  await page.goto("/it/voli?da=MXP&a=CTA&andata=2030-06-10&persone=2");
  const link = page.locator('a[href^="/api/go/flight"]').first();
  if ((await link.count()) === 0) {
    test.skip(true, "La pagina non espone un link firmato: manca FLIGHT_LINK_SECRET nell'ambiente.");
  }
  const href = await link.getAttribute("href");
  expect(href).not.toBeNull();

  const res = await request.get(href ?? "", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  const location = res.headers()["location"] ?? "";
  expect(location).toMatch(/^https:\/\/www\.aviasales\.com\/search\//);
  const subId = new URL(location).searchParams.get("sub_id");
  expect(subId).toMatch(/^[a-z0-9]{12,32}$/);

  const { withDb } = await import("./db.mjs");
  const rows = await withDb(
    (sql) => sql`select context, offer_id, partner from public.affiliate_clicks where subid = ${subId}`,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]?.context).toBe("flights");
  expect(rows[0]?.offer_id).toBeNull();
  expect(rows[0]?.partner).toBe("travelpayouts");
});
