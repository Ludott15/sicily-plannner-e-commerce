import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Builder del viaggio, seconda parte (1.4): un altro utente non apre il viaggio; il link pubblico
// funziona senza account e, revocato, dà 404; aggiunta e rimozione di un giorno; trascinamento da
// tastiera tra giorni a 1280 px; il calendario .ics con un evento per giorno.

const TEMPLATE = "demo-weekend-palermo";
const FIRST_STOP = "Street food al mercato di Ballarò";

async function useTemplate(page: Page) {
  await page.goto(`/it/itinerari/${TEMPLATE}`);
  await page.getByRole("link", { name: "Usa questo itinerario" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/it/viaggio/salva\\?da=${TEMPLATE}$`));
  await page.getByLabel("Data di partenza").fill("2027-05-12");
  await page.getByLabel("Persone").selectOption("4");
  const save = page.getByRole("button", { name: "Salva il viaggio" });
  // Senza sessione serve Turnstile (chiavi di prova: si risolve da solo).
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await save.click();
  await expect(page).toHaveURL(/\/it\/viaggi\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test("un altro utente non apre il viaggio né il suo calendario", async ({ page, request, browser }) => {
  const tripId = await useTemplate(page);
  const other = await browser.newPage();
  await signUpWithCode(other, request);

  const trip = await other.goto(`/it/viaggi/${tripId}`);
  expect(trip?.status()).toBe(404);
  const calendar = await other.goto(`/it/viaggi/${tripId}/calendario`);
  expect(calendar?.status()).toBe(404);
  await other.close();
});

test("link pubblico: si legge senza account, revocato porta a 404", async ({ page, browser }) => {
  await useTemplate(page);
  await page.getByRole("button", { name: "Crea link pubblico" }).click();
  const link = page.getByLabel("Link del viaggio");
  await expect(link).toHaveValue(/\/it\/v\/[A-Za-z0-9_-]{43}$/);
  const url = await link.inputValue();

  const anonymous = await browser.newContext();
  const guest = await anonymous.newPage();
  const shared = await guest.goto(url);
  expect(shared?.status()).toBe(200);
  await expect(guest.getByRole("heading", { level: 1 })).toHaveText("[DEMO] Weekend a Palermo e dintorni");
  await expect(guest.getByRole("button", { name: "Giorno 2 · Monreale e Palermo" })).toBeVisible();
  await expect(guest.getByRole("button", { name: /Sposta|Togli|Trascina/ })).toHaveCount(0);
  await expect(guest.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await page.getByRole("button", { name: "Revoca il link" }).click();
  await expect(page.getByRole("button", { name: "Crea link pubblico" })).toBeVisible();
  const revoked = await guest.goto(url);
  expect(revoked?.status()).toBe(404);
  await anonymous.close();
});

test("aggiunta e rimozione di un giorno", async ({ page }) => {
  await useTemplate(page);
  await page.getByRole("button", { name: "Aggiungi un giorno" }).click();
  await expect(page.getByRole("button", { name: /^Giorno 4 · / })).toBeVisible();

  await page.getByRole("button", { name: /^Giorno 4 · / }).click();
  await page.getByRole("button", { name: "Togli il giorno 4" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Togli il giorno", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Giorno 4 · / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Giorno 3 · Cefalù" })).toBeVisible();
});

test("trascinamento da tastiera tra giorni (1280 px)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await useTemplate(page);
  const handle = page.getByRole("button", { name: `Trascina per spostare: ${FIRST_STOP}` });
  await handle.focus();
  // dnd-kit misura le posizioni nei frame successivi: dopo ogni tasto si aspetta l'annuncio
  // della sua live region, altrimenti i tasti si perdono.
  const live = page.locator('[id^="DndLiveRegion"]');
  await page.keyboard.press("Space");
  await expect(live).toContainText(FIRST_STOP);

  // Le frecce portano la tappa sulla zona del giorno 2.
  // Le zone dei giorni stanno sotto la lista, una sotto l'altra: se la freccia giù va oltre (giorno 3), si torna su.
  for (let step = 0; step < 15; step++) {
    const before = (await live.textContent()) ?? "";
    if (before.includes("sopra il giorno 2")) break;
    await page.keyboard.press(before.includes("sopra il giorno 3") ? "ArrowUp" : "ArrowDown");
    await expect(live).not.toHaveText(before, { timeout: 2000 }).catch(() => undefined);
  }
  await expect(live).toContainText("sopra il giorno 2");
  await page.keyboard.press("Enter");
  await expect(live).toContainText("posata al giorno 2");

  await expect(page.getByRole("button", { name: "Giorno 2 · Monreale e Palermo" })).toHaveAttribute("aria-current", "true");
  await expect(page.locator("li.is-stop .is-stop__title").last()).toHaveText(FIRST_STOP);
});

test(".ics: un evento per giorno", async ({ page }) => {
  await useTemplate(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Esporta calendario (.ics)" }).click(),
  ]);
  const path = await download.path();
  const text = await readFile(path!, "utf8");
  expect(text.match(/BEGIN:VEVENT/g)?.length).toBe(3);
  expect(text).toContain("DTSTART;VALUE=DATE:20270512");
});
