import { createHash, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Ordini (passo 7.3) con il provider di prova (CHECKOUT_TEST_PROVIDER=fake). Il pagamento di prova porta
// all'esito senza creare l'ordine: l'ordine lo crea il webhook simulato, chiamato qui con la route di prova
// /api/stripe/test-complete (stessa verifica della firma e stesso gestore del webhook reale). Il token dell'ospite
// esiste solo come hash nel database e in email: qui se ne imposta uno noto con withDb, poi si usa il link.

const fakeProvider = process.env.CHECKOUT_TEST_PROVIDER === "fake";
test.skip(!fakeProvider, "serve CHECKOUT_TEST_PROVIDER=fake");

const ORDER_PATH = /\/it\/ordini\/ISU-\d{4}-\d{6}$/;

async function addFromProduct(page: Page, slug: string) {
  await page.goto(`/it/prodotti/${slug}`);
  await page.getByRole("button", { name: "Aggiungi al carrello" }).click();
  await expect(page.getByText("Aggiunto al carrello", { exact: true })).toBeVisible();
}

// Dal carrello al pagamento di prova e poi all'esito: restituisce l'identificativo della sessione.
async function payWithFake(page: Page): Promise<string> {
  await page.goto("/it/carrello");
  await page.getByRole("button", { name: "Paga con Stripe" }).click();
  await expect(page).toHaveURL(/\/it\/carrello\/prova-pagamento\?sessione=cs_fake_[0-9a-f]{32}$/);
  const sessionId = new URL(page.url()).searchParams.get("sessione");
  if (!sessionId) throw new Error("sessione assente");
  await page.getByRole("link", { name: "Paga", exact: true }).click();
  await expect(page).toHaveURL(/\/it\/carrello\/esito\?sessione=cs_fake_/);
  return sessionId;
}

// Il webhook simulato per la sessione: crea l'ordine. Il checkout è quello della sessione di prova.
async function completePayment(request: APIRequestContext, sessionId: string) {
  const { withDb } = await import("./db.mjs");
  const rows = await withDb(
    (sql) => sql`select id from checkout_sessions where stripe_session_id = ${sessionId}`,
  );
  const checkoutId = rows[0]?.id;
  expect(checkoutId).toBeTruthy();
  const response = await request.post("/api/stripe/test-complete", { data: { checkoutId } });
  expect(response.status()).toBe(200);
}

async function orderFor(sessionId: string): Promise<{ id: string; orderNumber: string; userId: string | null }> {
  const { withDb } = await import("./db.mjs");
  const rows = await withDb(
    (sql) => sql`select id, order_number, user_id from orders where stripe_session_id = ${sessionId}`,
  );
  const row = rows[0];
  if (!row) throw new Error("ordine non creato dal webhook di prova");
  return { id: row.id as string, orderNumber: row.order_number as string, userId: (row.user_id as string | null) ?? null };
}

test("ospite: pagamento di prova, esito con il numero, link con il token e 404 con un token sbagliato", async ({
  page,
  request,
}) => {
  await addFromProduct(page, "demo-crema-pistacchio");
  const sessionId = await payWithFake(page);
  await completePayment(request, sessionId);

  await expect(page.getByRole("heading", { level: 1, name: "Pagamento ricevuto" })).toBeVisible({ timeout: 15_000 });
  const { id, orderNumber } = await orderFor(sessionId);
  await expect(page.getByRole("link", { name: "Vedi l’ordine" })).toHaveAttribute(
    "href",
    new RegExp(`/it/ordini/${orderNumber}$`),
  );

  // Il token del link dell'email: solo l'hash finisce nel database.
  const { withDb } = await import("./db.mjs");
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await withDb((sql) => sql`update orders set access_token_hash = ${hash} where id = ${id}`);

  await page.goto(`/it/ordini/${orderNumber}?t=${token}`);
  await expect(page.getByRole("heading", { level: 1, name: `Ordine ${orderNumber}` })).toBeVisible();
  await expect(page.getByText("Pagato, in preparazione", { exact: true })).toBeVisible();
  // Il token esce dalla barra degli indirizzi dopo il caricamento.
  await expect(page).toHaveURL(ORDER_PATH);

  // Un token diverso non apre l'ordine.
  const wrong = await page.goto(`/it/ordini/${orderNumber}?t=${randomBytes(32).toString("base64url")}`);
  expect(wrong?.status()).toBe(404);
});

test("account: ordine in /ordini, spedizione dall'admin, consegna e punti una sola volta", async ({
  page,
  browser,
  request,
}) => {
  const { withDb } = await import("./db.mjs");
  await signUpWithCode(page, request);
  await addFromProduct(page, "demo-crema-pistacchio");
  const sessionId = await payWithFake(page);
  await completePayment(request, sessionId);
  await expect(page.getByRole("heading", { level: 1, name: "Pagamento ricevuto" })).toBeVisible({ timeout: 15_000 });
  const { id, orderNumber } = await orderFor(sessionId);

  await page.goto("/it/ordini");
  await expect(page.getByRole("link", { name: new RegExp(orderNumber) })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(orderNumber) }).click();
  await expect(page).toHaveURL(new RegExp(`/it/ordini/${orderNumber}$`));
  await expect(page.getByText("Pagato, in preparazione", { exact: true })).toBeVisible();

  // Admin in un altro contesto: promosso nel database, come negli altri e2e.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const adminEmail = await signUpWithCode(adminPage, request);
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${adminEmail})`);

  await adminPage.goto("/it/admin/ordini?attenzione=to_forward");
  await expect(adminPage.getByRole("link", { name: orderNumber })).toBeVisible();

  await adminPage.goto(`/it/admin/ordini/${id}`);
  await adminPage.getByLabel("Corriere", { exact: true }).fill("Corriere e2e");
  await adminPage.getByLabel("Numero di tracciamento", { exact: true }).fill("E2E-TRACK-123");
  await adminPage.getByLabel("Link di tracciamento", { exact: true }).fill("https://example.com/track/e2e");
  await adminPage.getByRole("button", { name: "Segna come spedito" }).click();
  await expect(adminPage.locator(".is-tag", { hasText: "Spedito" })).toBeVisible();

  // Il cliente vede lo stato spedito, il corriere e il link di tracciamento.
  await page.goto(`/it/ordini/${orderNumber}`);
  await expect(page.getByText("Spedito", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("E2E-TRACK-123", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Segui la spedizione" })).toHaveAttribute(
    "href",
    "https://example.com/track/e2e",
  );

  // Consegna dall'admin: il cliente vede consegnato e i punti dell'ordine compaiono una sola volta.
  await adminPage.goto(`/it/admin/ordini/${id}`);
  await adminPage.getByRole("button", { name: "Segna come consegnato" }).click();
  await expect(adminPage.locator(".is-tag", { hasText: "Consegnato" })).toBeVisible();

  await page.goto(`/it/ordini/${orderNumber}`);
  await expect(page.getByText("Consegnato", { exact: true }).first()).toBeVisible();
  const points = await withDb(
    (sql) =>
      sql`select count(*)::int as n from points_ledger where ref_id = ${id} and reason = 'order'`,
  );
  expect(points[0]?.n).toBe(1);

  await adminContext.close();
});
