import { expect, test } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Shop (passo 7.1): usa il seed demo di supabase/seed.sql (fornitore, due produttori, otto prodotti,
// una box, il deperibile e i collegamenti "Dal territorio" a Bronte e Ragusa Ibla).
// Il prodotto creato dall'admin ha il prefisso e2e-: lo elimina la pulizia globale.

test("shop: il filtro per categoria mostra solo i dolci demo", async ({ page }) => {
  await page.goto("/it/shop");
  await page.getByLabel("Categoria", { exact: true }).selectOption("dolci");
  await page.getByRole("button", { name: "Applica i filtri" }).click();
  // Il modulo GET aggiunge anche i filtri vuoti: basta che la categoria sia nell'URL.
  await expect(page).toHaveURL(/\/it\/shop\?.*categoria=dolci/);

  const list = page.getByRole("list", { name: "Shop" });
  await expect(list.getByRole("link", { name: "[DEMO] Crema di pistacchio" })).toBeVisible();
  await expect(list.getByRole("link", { name: "[DEMO] Cannolo alla ricotta" })).toBeVisible();
  await expect(list.getByRole("link", { name: "[DEMO] Olio extravergine iblea" })).toHaveCount(0);
});

test("pagina prodotto: allergeni in evidenza, prezzo IVA inclusa e tempi di spedizione", async ({ page }) => {
  await page.goto("/it/prodotti/demo-crema-pistacchio");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("[DEMO] Crema di pistacchio");
  await expect(page.getByText("IVA inclusa", { exact: true })).toBeVisible();
  await expect(page.getByText("Spedito dal nostro fornitore in 3 giorni lavorativi")).toBeVisible();

  // Allergeni verificati: il seed ha frutta a guscio e latte, in badge in grassetto.
  await expect(page.getByText("Frutta a guscio", { exact: true })).toHaveClass(/font-bold/);
  await expect(page.getByText("Latte", { exact: true })).toHaveClass(/font-bold/);
  // Non deperibile: nessun avviso di deperibilità, ma il recesso di 14 giorni.
  await expect(page.getByText("Prodotto deperibile.")).toHaveCount(0);
  const withdrawal = page.getByRole("note").filter({ hasText: "Hai 14 giorni dalla consegna" });
  await expect(withdrawal).toBeVisible();

  // "Dal territorio": il pistacchio porta a Bronte.
  await expect(page.getByRole("link", { name: "Bronte", exact: true })).toBeVisible();
});

test("pagina prodotto deperibile: avviso sul recesso e scadenza minima", async ({ page }) => {
  await page.goto("/it/prodotti/demo-cannoli-ricotta");
  await expect(page.getByText("Prodotto deperibile.")).toBeVisible();
  await expect(page.getByText(/Il recesso non si applica ai prodotti deperibili/)).toBeVisible();
  await expect(page.getByText("5 giorni", { exact: true })).toBeVisible();
  // Deperibile: al posto del recesso di 14 giorni c'è l'avviso che non si applica.
  await expect(page.getByText("Hai 14 giorni dalla consegna")).toHaveCount(0);
  for (const allergen of ["Glutine", "Latte", "Uova"]) {
    await expect(page.getByText(allergen, { exact: true })).toHaveClass(/font-bold/);
  }
});

test("pagina prodotto della box: i componenti con le quantità", async ({ page }) => {
  await page.goto("/it/prodotti/demo-box-sicilia");
  const box = page.locator('section[aria-labelledby="dentro-la-box"]');
  await expect(box.getByRole("link", { name: "[DEMO] Pasta di grano antico" })).toBeVisible();
  await expect(box.getByText("2 ×")).toBeVisible();
});

test("pagina produttore: storia e prodotti del produttore", async ({ page }) => {
  await page.goto("/it/produttori/demo-pistacchi-bronte");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("[DEMO] Pistacchi di Bronte");
  await expect(page.getByText("[DEMO] Storia di prova di un produttore di pistacchio.")).toBeVisible();
  const products = page.locator('section[aria-labelledby="prodotti-produttore"]');
  await expect(products.getByRole("link", { name: "[DEMO] Crema di pistacchio" })).toBeVisible();
  await expect(products.getByRole("link", { name: "[DEMO] Formaggio ragusano" })).toHaveCount(0);
});

test("Dal territorio: il luogo collegato mostra i suoi prodotti, il luogo senza collegamenti no", async ({ page, request }) => {
  await page.goto("/it/luoghi/demo-bronte");
  const section = page.locator('section[aria-labelledby="dal-territorio-luogo"]');
  await expect(section.getByRole("heading", { name: "Dal territorio" })).toBeVisible();
  await expect(section.getByRole("link", { name: "[DEMO] Crema di pistacchio" })).toBeVisible();

  expect((await request.get("/it/luoghi/demo-cefalu")).status()).toBe(200);
  await page.goto("/it/luoghi/demo-cefalu");
  await expect(page.getByRole("heading", { name: "Dal territorio" })).toHaveCount(0);
});

test("ricerca: trova un prodotto dello shop", async ({ page }) => {
  await page.goto("/it/cerca?q=pistacchio");
  const group = page.locator('section[aria-labelledby="search-group-product"]');
  await expect(group.getByRole("link", { name: /Crema di pistacchio/ })).toBeVisible();
  await group.getByRole("link", { name: /Crema di pistacchio/ }).click();
  await expect(page).toHaveURL(/\/it\/prodotti\/demo-crema-pistacchio$/);
});

test("admin: crea un prodotto; attivo senza allergeni verificati non si salva", async ({ page, request }) => {
  const email = await signUpWithCode(page, request);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);

  const stamp = Date.now();
  const title = `e2e- Prodotto di prova ${stamp}`;
  const slug = `e2e-prodotto-${stamp}`;
  await page.goto("/it/admin/prodotti/nuovo");
  await page.getByLabel("Nome (italiano)", { exact: true }).fill(title);
  await page.getByLabel("Slug", { exact: true }).fill(slug);
  await page.getByLabel("Produttore", { exact: true }).selectOption({ label: "[DEMO] Pistacchi di Bronte" });
  await page.getByLabel("Fornitore", { exact: true }).selectOption({ label: "[DEMO] Fornitore" });
  await page.getByLabel("Prezzo di vendita (€)").fill("9,90");
  await page.getByLabel("Attivo", { exact: true }).check();

  // Senza ingredienti, formato e la spunta "Allergeni verificati" il prodotto attivo non si salva:
  // il messaggio dice cosa manca.
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ingredienti e formato" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Allergeni verificati" })).toBeVisible();
  expect((await request.get(`/it/prodotti/${slug}`)).status()).toBe(404);

  await page.getByLabel("Ingredienti (italiano)", { exact: true }).fill("Latte fresco, zucchero.");
  await page.getByLabel("Formato", { exact: true }).fill("vasetto 190 g");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ingredienti e formato" })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "Allergeni verificati" })).toBeVisible();

  await page.getByLabel("Latte", { exact: true }).check();
  await page.getByLabel("Allergeni verificati", { exact: true }).check();
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Salvato" })).toBeVisible();

  // Nell'elenco admin e, attivo, nella pagina pubblica con il latte in evidenza.
  await page.goto("/it/admin/prodotti");
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
  await page.goto(`/it/prodotti/${slug}`);
  await expect(page.getByText("Latte", { exact: true })).toHaveClass(/font-bold/);
});
