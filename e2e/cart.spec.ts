import { expect, test, type Page } from "@playwright/test";

// Carrello e checkout (passo 7.2). Il seed demo (supabase/seed.sql) dà il prodotto non deperibile
// "Crema di pistacchio" e il deperibile "Cannoli alla ricotta". Ogni test parte da un carrello vuoto
// (contesto nuovo). Il pagamento di prova richiede CHECKOUT_TEST_PROVIDER=fake: in quel caso il
// pulsante "Paga con Stripe" porta alla pagina di prova invece che a Stripe.

const PISTACCHIO = "[DEMO] Crema di pistacchio";
const fakeProvider = process.env.CHECKOUT_TEST_PROVIDER === "fake";

async function addFromProduct(page: Page, slug: string, quantity = 1) {
  await page.goto(`/it/prodotti/${slug}`);
  if (quantity !== 1) {
    await page.getByRole("combobox", { name: /^Quantità:/ }).selectOption(String(quantity));
  }
  await page.getByRole("button", { name: "Aggiungi al carrello" }).click();
  await expect(page.getByText("Aggiunto al carrello", { exact: true })).toBeVisible();
}

test("aggiunta dalla pagina prodotto: quantità, annuncio e badge nell'intestazione", async ({ page }) => {
  await addFromProduct(page, "demo-crema-pistacchio", 2);
  await expect(page.getByRole("button", { name: "Carrello, 2 articoli" })).toBeVisible();
});

test("aggiunta dalla card dello shop: il badge conta le unità", async ({ page }) => {
  await page.goto("/it/shop");
  const card = page.locator("article").filter({ hasText: PISTACCHIO });
  await card.getByRole("button", { name: "Aggiungi al carrello" }).click();
  await expect(card.getByText("Aggiunto al carrello", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Carrello, 1 articolo" })).toBeVisible();
});

test("drawer del carrello da desktop: si apre dall'intestazione e si chiude con Escape", async ({ page }) => {
  await addFromProduct(page, "demo-crema-pistacchio");
  await page.getByRole("button", { name: "Carrello, 1 articolo" }).click();
  const drawer = page.getByRole("dialog", { name: "Carrello" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: PISTACCHIO })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("pagina del carrello: quantità modificabile, rimozione e spedizione gratuita", async ({ page }) => {
  await addFromProduct(page, "demo-crema-pistacchio");
  await page.goto("/it/carrello");
  await expect(page.getByText("Ti mancano", { exact: false }).first()).toBeVisible();

  const quantity = page.getByRole("combobox", { name: `Quantità: ${PISTACCHIO}` });
  await quantity.selectOption("3");
  await expect(page.getByRole("button", { name: "Carrello, 3 articoli" })).toBeVisible();

  await page.getByRole("button", { name: `Rimuovi ${PISTACCHIO} dal carrello` }).click();
  await expect(page.getByText("Il carrello è vuoto.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Carrello vuoto" })).toBeVisible();
});

test("prodotto deperibile: l'avviso compare nel carrello", async ({ page }) => {
  await addFromProduct(page, "demo-cannoli-ricotta");
  await page.goto("/it/carrello");
  await expect(page.getByRole("note").filter({ hasText: "prodotti deperibili" })).toBeVisible();
});

test("su mobile l'icona del carrello porta alla pagina, senza drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addFromProduct(page, "demo-crema-pistacchio");
  // Su mobile il carrello è sia nell'intestazione sia come badge nella barra in basso: si usa quello dell'intestazione.
  await page.getByRole("banner").getByRole("link", { name: "Carrello, 1 articolo" }).click();
  await expect(page).toHaveURL(/\/it\/carrello$/);
  await expect(page.getByRole("heading", { level: 1, name: "Carrello" })).toBeVisible();
});

test("esito senza sessione: torna al carrello e non lo svuota", async ({ page }) => {
  await addFromProduct(page, "demo-crema-pistacchio");
  await page.goto("/it/carrello/esito");
  await expect(page).toHaveURL(/\/it\/carrello$/);
  await expect(page.getByRole("button", { name: "Carrello, 1 articolo" })).toBeVisible();
});

test("esito con un identificativo non valido: torna al carrello e non lo svuota", async ({ page }) => {
  await addFromProduct(page, "demo-crema-pistacchio");
  await page.goto("/it/carrello/esito?sessione=non_valido");
  await expect(page).toHaveURL(/\/it\/carrello$/);
  await expect(page.getByRole("button", { name: "Carrello, 1 articolo" })).toBeVisible();
});

test("senza provider di pagamento il pulsante Paga è in sospeso", async ({ page }) => {
  test.skip(fakeProvider, "con il provider di prova il pulsante è attivo");
  await addFromProduct(page, "demo-crema-pistacchio");
  await page.goto("/it/carrello");
  await expect(page.locator('[data-pending-id="checkout.pay"]')).toHaveAttribute("aria-disabled", "true");
});

test.describe("checkout con il provider di prova", () => {
  test.skip(!fakeProvider, "serve CHECKOUT_TEST_PROVIDER=fake");

  test("ospite: pagamento di prova fino all'esito, il carrello si svuota", async ({ page }) => {
    await addFromProduct(page, "demo-crema-pistacchio");
    await page.goto("/it/carrello");
    await page.getByRole("button", { name: "Paga con Stripe" }).click();
    await expect(page).toHaveURL(/\/it\/carrello\/prova-pagamento\?sessione=cs_fake_[0-9a-f]{32}$/);

    await page.getByRole("link", { name: "Paga", exact: true }).click();
    await expect(page).toHaveURL(/\/it\/carrello\/esito\?sessione=cs_fake_/);
    await expect(page.getByRole("heading", { level: 1, name: "Grazie" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Carrello vuoto" })).toBeVisible();
  });

  test("annullamento: il carrello resta com'era", async ({ page }) => {
    await addFromProduct(page, "demo-crema-pistacchio", 2);
    await page.goto("/it/carrello");
    await page.getByRole("button", { name: "Paga con Stripe" }).click();
    await expect(page).toHaveURL(/prova-pagamento/);

    await page.getByRole("link", { name: "Annulla", exact: true }).click();
    await expect(page).toHaveURL(/\/it\/carrello\?annullato=1$/);
    await expect(page.getByText("Pagamento annullato.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Carrello, 2 articoli" })).toBeVisible();
  });

  test("scadenza simulata: si torna al carrello", async ({ page }) => {
    await addFromProduct(page, "demo-crema-pistacchio");
    await page.goto("/it/carrello");
    await page.getByRole("button", { name: "Paga con Stripe" }).click();
    await expect(page).toHaveURL(/prova-pagamento/);

    await page.getByRole("button", { name: "Simula la scadenza" }).click();
    await expect(page).toHaveURL(/\/it\/carrello$/);
    await expect(page.getByRole("button", { name: "Carrello, 1 articolo" })).toBeVisible();
  });

  test("la pagina di prova non è raggiungibile con un identificativo non valido", async ({ page }) => {
    const response = await page.goto("/it/carrello/prova-pagamento?sessione=cs_fake_non_valido");
    expect(response?.status()).toBe(404);
  });
});
