import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { sessionUserId, signUpWithCode, testEmail, waitForCode } from "./helpers";

// Gruppi (4.1): il gruppo nasce dal viaggio, il link porta l'anteprima anche senza account,
// l'accesso con codice torna all'invito, l'owner vede e rimuove i membri, un link revocato dà un
// messaggio chiaro, un ex membro perde l'accesso e un ospite non entra.

// Viaggio dell'owner nel database (titolo e-2e: la pulizia lo elimina).
async function createTrip(title: string, ownerId: string) {
  const { withDb } = await import("./db.mjs");
  const [trip] = await withDb(
    (sql) => sql`insert into public.itineraries (owner_id, title, days) values (${ownerId}, ${title}, 2) returning id`,
  );
  return trip!.id as string;
}

// Owner con un viaggio e il gruppo creato dalla pagina del viaggio. Ritorna i percorsi.
async function ownerGroup(page: Page, request: APIRequestContext) {
  const title = `e2e-gruppo-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  await signUpWithCode(page, request);
  const tripId = await createTrip(title, await sessionUserId(page));

  await page.goto(`/it/viaggi/${tripId}`);
  await page.getByRole("tab", { name: "Gruppo" }).click();
  await expect(page.getByRole("heading", { name: "Viaggia in gruppo" })).toBeVisible();
  await page.getByRole("button", { name: "Crea il gruppo" }).click();
  await expect(page).toHaveURL(/\/it\/gruppi\/[0-9a-f-]{36}$/);
  const groupPath = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return { title, tripId, groupPath };
}

// L'invito si apre dal pulsante "Invita" dell'intestazione (dialog con link ed email).
async function openInvite(page: Page) {
  await page.getByRole("button", { name: "Invita", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Invita al gruppo" })).toBeVisible();
}

// Il link compare una sola volta, appena creato: se ne legge il percorso. Poi il dialog si chiude.
async function createInviteLink(page: Page) {
  await openInvite(page);
  await page.getByRole("button", { name: "Crea link" }).click();
  const link = page.getByLabel("Link di invito");
  await expect(link).toHaveValue(/\/it\/invito\/.+/);
  const path = new URL(await link.inputValue()).pathname;
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Invita al gruppo" })).toBeHidden();
  return path;
}

test("gruppo dal viaggio: anteprima senza account, accesso con codice, ingresso e rimozione", async ({ page, request, browser }) => {
  const { title, tripId, groupPath } = await ownerGroup(page, request);
  const invitePath = await createInviteLink(page);

  // Chi riceve il link vede l'anteprima senza account.
  const stranger = await browser.newContext();
  const invitee = await stranger.newPage();
  await invitee.goto(invitePath);
  await expect(invitee.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(invitee.getByText("Tappe del viaggio")).toBeVisible();

  // Accesso con codice: il ritorno porta di nuovo all'invito.
  await invitee.getByRole("link", { name: "Accedi con il codice" }).click();
  await expect(invitee).toHaveURL(/\/it\/login\?next=/);
  const inviteeEmail = testEmail();
  await invitee.getByLabel("Email").fill(inviteeEmail);
  await invitee.getByRole("button", { name: "Mandami il codice" }).click();
  await expect(invitee.getByRole("status")).toContainText(inviteeEmail);
  await invitee.getByLabel("Codice di 6 cifre").fill(await waitForCode(request, inviteeEmail));
  await invitee.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(invitee).toHaveURL((url) => url.pathname === invitePath);

  // Account nuovo senza gusti: prima il percorso dei gusti, che poi riporta all'invito.
  await invitee.getByRole("link", { name: "Scegli i gusti" }).click();
  await expect(invitee).toHaveURL(/\/it\/viaggio\/nuovo\?/);
  for (let domanda = 1; domanda <= 7; domanda++) {
    await expect(invitee.getByText(`Domanda ${domanda} di 7`)).toBeVisible();
    await invitee.getByRole("button", { name: "Salta" }).click();
  }
  await expect(invitee).toHaveURL((url) => url.pathname === invitePath);

  await invitee.getByRole("button", { name: "Entra nel gruppo" }).click();
  await expect(invitee).toHaveURL((url) => url.pathname === groupPath);

  // L'owner vede il nuovo membro e lo rimuove. Dopo la rimozione il gruppo e il viaggio non si aprono più.
  await page.goto(groupPath);
  const members = page.getByRole("region", { name: "Persone nel gruppo" });
  await expect(members.getByRole("listitem")).toHaveCount(2);
  const newcomer = members.getByRole("listitem").filter({ hasNotText: "(tu)" });
  await newcomer.getByRole("button", { name: /^Azioni per/ }).click();
  await page.getByRole("menuitem", { name: "Rimuovi" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sì, rimuovi" }).click();
  await expect(members.getByRole("listitem")).toHaveCount(1);

  const removed = await invitee.goto(groupPath);
  expect(removed?.status()).toBe(404);
  const removedTrip = await invitee.goto(`/it/viaggi/${tripId}`);
  expect(removedTrip?.status()).toBe(404);

  // Il link revocato: chi lo apre legge il motivo, senza dati del gruppo.
  await page.goto(groupPath);
  await openInvite(page);
  await page.getByRole("button", { name: "Revoca link" }).click();
  await expect(page.getByRole("dialog").getByText("Nessun link attivo.")).toBeVisible();
  await invitee.goto(invitePath);
  await expect(invitee.getByText("Questo invito non è più attivo")).toBeVisible();

  await stranger.close();
});

test("invito per email: senza servizio di posta il messaggio dice cosa fare", async ({ page, request }) => {
  const { groupPath } = await ownerGroup(page, request);
  await page.goto(groupPath);
  await openInvite(page);
  await page.getByLabel("Email di chi vuoi invitare").fill(testEmail());
  await page.getByRole("button", { name: "Invia l'invito" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("L'invio di email non è disponibile");
});

test("ospite: l'invito mostra l'anteprima e chiede l'account, senza il pulsante di ingresso", async ({ page, request, browser }) => {
  const { title, groupPath } = await ownerGroup(page, request);
  await page.goto(groupPath);
  const invitePath = await createInviteLink(page);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto("/it/login");
  await guest.getByRole("button", { name: "Continua senza account" }).click();
  await expect(guest).toHaveURL(/\/it\/profilo$/);

  await guest.goto(invitePath);
  await expect(guest.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(guest.getByText("Per entrare nel gruppo serve un account")).toBeVisible();
  await expect(guest.getByRole("button", { name: "Entra nel gruppo" })).toHaveCount(0);
  await guestContext.close();
});
