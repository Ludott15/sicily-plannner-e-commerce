import { expect, test, type Page } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Menu delle conversazioni (assistente, redesign). Il server usa il modello di prova (CHAT_TEST_MODEL=scripted):
// il primo messaggio con "attività" produce una risposta e salva la conversazione. I titoli di prova hanno il
// prefisso e2e- così la pulizia li elimina.

const FIRST_MESSAGE = "Quali attività ci sono a Palermo?";
const RENAMED = "e2e-Titolo rinominato";
const SESSION_PATH = /\/it\/chat\/[0-9a-f-]{36}$/;

// Crea una conversazione con una risposta dell'assistente e aspetta che l'indirizzo sia quello della sessione.
async function createConversation(page: Page) {
  await page.goto("/it/chat?nuova=1");
  await expect(page.getByRole("heading", { level: 1, name: "Assistente" })).toBeVisible();
  const box = page.getByLabel("Scrivi all'assistente");
  await expect(box).toBeEnabled();
  await box.fill(FIRST_MESSAGE);
  await page.getByRole("button", { name: "Invia" }).click();
  await expect(page).toHaveURL(SESSION_PATH, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: /^Vedi/ }).first()).toBeVisible({ timeout: 30_000 });
  // L'indirizzo cambia senza navigare: si apre la pagina della conversazione, con il suo menu.
  const path = new URL(page.url()).pathname;
  await page.goto(path);
  await expect(page.getByRole("link", { name: /^Vedi/ }).first()).toBeVisible({ timeout: 30_000 });
  return path;
}

// Il focus deve stare dentro un <dialog> aperto (non tornare sul pulsante del menu, fuori dal dialog).
async function expectFocusInsideDialog(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest("dialog") !== null && document.activeElement !== null))
    .toBe(true);
}

test.describe("menu delle conversazioni, desktop 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("rinomina aggiorna il titolo; elimina tiene il focus nel dialog e torna a /chat", async ({ page, request }) => {
    await signUpWithCode(page, request);
    const sessionPath = await createConversation(page);

    // Sull'intestazione c'è un solo menu visibile: la colonna laterale su desktop non ne mostra.
    const menuButton = page.getByRole("button", { name: "Azioni della conversazione" });
    await expect(menuButton).toHaveCount(1);
    await menuButton.click();

    await page.getByRole("menuitem", { name: "Rinomina" }).click();
    const rename = page.getByRole("dialog", { name: "Rinomina" });
    await expect(rename).toBeVisible();
    await rename.getByLabel("Titolo della conversazione").fill(RENAMED);
    await rename.getByRole("button", { name: "Salva titolo" }).click();

    // Il titolo cambia nell'intestazione e nell'elenco della colonna laterale.
    await expect(page.getByRole("heading", { level: 1, name: RENAMED })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`main a[href="${sessionPath}"]`)).toHaveText(RENAMED);

    await menuButton.click();
    await page.getByRole("menuitem", { name: "Elimina conversazione" }).click();
    const confirm = page.getByRole("dialog", { name: "Eliminare la conversazione?" });
    await expect(confirm).toBeVisible();
    await expectFocusInsideDialog(page);

    await confirm.getByRole("button", { name: "Elimina", exact: true }).click();
    await expect(page).toHaveURL(/\/it\/chat$/, { timeout: 15_000 });
    await expect(page.locator(`main a[href="${sessionPath}"]`)).toHaveCount(0);
  });
});

test.describe("menu delle conversazioni, mobile 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("nello sheet il menu è visibile e cliccabile, e rinomina aggiorna l'elenco", async ({ page, request }) => {
    await signUpWithCode(page, request);
    const sessionPath = await createConversation(page);

    await page.getByRole("button", { name: "Conversazioni", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Conversazioni" });
    await expect(sheet).toBeVisible();

    // Il pulsante "..." della riga sta dentro lo sheet: il pulsante della pagina è fuori dal dialog.
    const rowMenu = sheet.getByRole("button", { name: "Azioni della conversazione" });
    await expect(rowMenu).toHaveCount(1);
    await rowMenu.click();

    // Il pannello del menu viene portato dentro lo sheet (top layer): deve essere visibile e cliccabile.
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const rename = menu.getByRole("menuitem", { name: "Rinomina" });
    await expect(rename).toBeVisible();
    await rename.click();

    const dialog = page.getByRole("dialog", { name: "Rinomina" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Titolo della conversazione").fill(RENAMED);
    await dialog.getByRole("button", { name: "Salva titolo" }).click();

    // Su mobile la colonna laterale è nascosta ma resta nel DOM: si verifica l'elenco dello sheet,
    // riaprendolo dopo l'aggiornamento della pagina se si è chiuso.
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await page.reload();
    await page.getByRole("button", { name: "Conversazioni", exact: true }).click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: RENAMED })).toBeVisible({ timeout: 15_000 });
    await expect(sheet.locator(`a[href="${sessionPath}"]`)).toHaveText(RENAMED);
  });
});
