import { expect, test } from "@playwright/test";
import {
  lastMessageId,
  requestLoginCode,
  sessionUserId,
  signUpWithCode,
  testEmail,
  waitForCode,
  waitForMagicLink,
} from "./helpers";

// Accesso (docs/spec.md, "Accesso, ospiti e browser interni"): codice a 6 cifre nella stessa
// pagina, link come alternativa, Google nascosto nei browser interni, ospiti e conversione.

const INSTAGRAM_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 335.0.0.29.93 (iPhone15,2; iOS 17_5; it_IT; it; scale=3.00; 1179x2556; 612829127)";

test("accesso con codice, profilo protetto e logout", async ({ page, request }) => {
  // Senza sessione il profilo rimanda al login.
  await page.goto("/it/profilo");
  await expect(page).toHaveURL(/\/it\/login$/);

  const email = await signUpWithCode(page, request);
  await expect(page.getByText(email).first()).toBeVisible();

  await page.getByRole("button", { name: "Menu personale" }).click();
  await page.getByRole("menuitem", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/it$/);
  await expect(page.getByRole("link", { name: "Accedi" })).toBeVisible();

  await page.goto("/it/profilo");
  await expect(page).toHaveURL(/\/it\/login$/);
});

test("codice sbagliato: errore, l'email resta e il codice giusto entra", async ({ page, request }) => {
  const email = testEmail();
  await requestLoginCode(page, email);
  const code = await waitForCode(request, email);
  const wrong = code === "000000" ? "111111" : "000000";

  await page.getByLabel("Codice di 6 cifre").fill(wrong);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Il codice non è giusto o è scaduto. Controlla l'ultima email ricevuta, o chiedine uno nuovo.");
  await expect(page.getByLabel("Codice di 6 cifre")).toHaveValue(wrong);

  await page.getByLabel("Codice di 6 cifre").fill(code);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(page).toHaveURL(/\/it\/profilo$/);
});

test("il link nell'email resta un'alternativa al codice", async ({ page, request }) => {
  const email = testEmail();
  await requestLoginCode(page, email);
  await page.goto(await waitForMagicLink(request, email));
  await expect(page).toHaveURL(/\/it\/profilo$/);
  await expect(page.getByText(email).first()).toBeVisible();
});

test("nel browser di Instagram Google non c'è, con l'invito ad aprire il browser", async ({ browser, page }) => {
  await page.goto("/it/login");
  await expect(page.getByRole("button", { name: "Continua con Google" })).toBeVisible();

  const context = await browser.newContext({ userAgent: INSTAGRAM_UA });
  const inApp = await context.newPage();
  await inApp.goto("/it/login");
  await expect(inApp.getByRole("button", { name: "Mandami il codice" })).toBeVisible();
  await expect(inApp.getByRole("button", { name: "Continua con Google" })).toHaveCount(0);
  await expect(inApp.getByText("Dal browser di Instagram Google non permette l'accesso.")).toBeVisible();
  await context.close();
});

// Criterio di chiusura: ospite → itinerario → registrazione con codice, l'itinerario resta suo.
// L'itinerario lo prepara il test nel database: crearlo dall'interfaccia è della milestone 5,
// che estende questo e2e al flusso completo.
test("ospite: crea un itinerario, salva l'account con il codice e l'itinerario resta suo", async ({ page, request }) => {
  const { withDb } = await import("./db.mjs");

  await page.goto("/it/login");
  await page.getByRole("button", { name: "Continua senza account" }).click();
  await expect(page).toHaveURL(/\/it\/profilo$/);
  await expect(page.getByRole("heading", { name: "Stai usando Isula come ospite" })).toBeVisible();
  // Il menu personale dell'ospite propone di creare l'account (porta al profilo, dove si salva con il codice).
  await page.getByRole("button", { name: "Menu personale" }).click();
  await expect(page.getByRole("menuitem", { name: "Crea l'account" })).toBeVisible();
  await page.keyboard.press("Escape");

  const guestId = await sessionUserId(page);
  const [guest] = await withDb((sql) => sql`select is_anonymous, email from auth.users where id = ${guestId}`);
  expect(guest).toMatchObject({ is_anonymous: true, email: null });

  const title = `e2e-viaggio-ospite-${Date.now()}`;
  const [itinerary] = await withDb(
    (sql) => sql`insert into public.itineraries (owner_id, title, days) values (${guestId}, ${title}, 3) returning id`,
  );

  const email = testEmail();
  const before = await lastMessageId(request, email);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Mandami il codice" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  await page.getByLabel("Codice di 6 cifre").fill(await waitForCode(request, email, before));
  await page.getByRole("button", { name: "Salva il mio account" }).click();

  await expect(page.getByRole("heading", { name: "Il tuo profilo" })).toBeVisible();
  await expect(page.getByText(email).first()).toBeVisible();
  expect(await sessionUserId(page)).toBe(guestId);

  const [account] = await withDb((sql) => sql`select is_anonymous, email from auth.users where id = ${guestId}`);
  expect(account).toMatchObject({ is_anonymous: false, email });
  const [owned] = await withDb((sql) => sql`select owner_id from public.itineraries where id = ${itinerary!.id}`);
  expect(owned?.owner_id).toBe(guestId);
});

test("ospite con l'email di un account esistente: errore, resta ospite", async ({ page, request, browser }) => {
  // Un account con questa email esiste già (creato in un altro contesto).
  const other = await browser.newContext();
  const email = await signUpWithCode(await other.newPage(), request);
  await other.close();

  await page.goto("/it/login");
  await page.getByRole("button", { name: "Continua senza account" }).click();
  await expect(page).toHaveURL(/\/it\/profilo$/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Mandami il codice" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Questa email ha già un account.");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
  await expect(page.getByRole("heading", { name: "Stai usando Isula come ospite" })).toBeVisible();

  // Nel database: l'ospite resta senza email, l'account dell'altro utente non cambia.
  const { withDb } = await import("./db.mjs");
  const guestId = await sessionUserId(page);
  const [guest] = await withDb((sql) => sql`select email, email_change, is_anonymous from auth.users where id = ${guestId}`);
  expect(guest).toMatchObject({ email: null, is_anonymous: true });
  expect(guest?.email_change ?? "").not.toBe(email);
  const owners = await withDb((sql) => sql`select id from auth.users where email = ${email}`);
  expect(owners).toHaveLength(1);
  expect(owners[0]!.id).not.toBe(guestId);
});

test("ospite: senza il codice giusto l'email non è sua", async ({ page, request }) => {
  const { withDb } = await import("./db.mjs");
  await page.goto("/it/login");
  await page.getByRole("button", { name: "Continua senza account" }).click();
  await expect(page).toHaveURL(/\/it\/profilo$/);
  const guestId = await sessionUserId(page);

  // Chiede il codice per un'email nuova ma non lo verifica: l'email resta in attesa, non sua.
  const email = testEmail();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Mandami il codice" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  const code = await waitForCode(request, email);
  const [pending] = await withDb((sql) => sql`select email, is_anonymous from auth.users where id = ${guestId}`);
  expect(pending).toMatchObject({ email: null, is_anonymous: true });

  // Codice sbagliato: errore, l'account non cambia.
  await page.getByLabel("Codice di 6 cifre").fill(code === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Salva il mio account" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Il codice non è giusto o è scaduto.");
  const [after] = await withDb((sql) => sql`select email, is_anonymous from auth.users where id = ${guestId}`);
  expect(after).toMatchObject({ email: null, is_anonymous: true });

  // Dopo un nuovo caricamento è ancora ospite.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Stai usando Isula come ospite" })).toBeVisible();
});

test("il callback rifiuta redirect esterni", async ({ page }) => {
  await page.goto("/api/auth/callback?next=//evil.com");
  await expect(page).toHaveURL(/localhost:3000\/it\/login\?error=callback$/);
});

test("il cron di pulizia degli ospiti non è pubblico", async ({ request }) => {
  expect((await request.get("/api/cron/cleanup-guests")).status()).toBe(401);
  const wrong = await request.get("/api/cron/cleanup-guests", { headers: { authorization: "Bearer sbagliato" } });
  expect(wrong.status()).toBe(401);
});
