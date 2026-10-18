import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { lastMessageId, sessionUserId, signUpWithCode, waitForCode } from "./helpers";

// Diritti sui dati (passo 8.2): consenso alla profilazione nell'onboarding, Account › Privacy con
// interruttori e scarico, eliminazione dell'account con codice da Mailpit e logout, ospite che
// elimina i suoi dati. Le email sono e2e-…@example.com: la pulizia globale elimina i loro utenti.

// Compilazione locale delle pagine e CAPTCHA: più tempo per test (come in onboarding.spec.ts).
test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(120_000);
});

const PROFILING = "Impari dai miei click";
const PHRASE = "ELIMINA";

test("onboarding: domanda separata sul consenso alla profilazione, nessuna scelta preselezionata", async ({ page }) => {
  await page.goto("/it/viaggio/nuovo?domanda=7");
  await expect(page.getByText("Domanda 7 di 7")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vuoi che Isula impari dai tuoi click, aggiunte e voti per migliorare le proposte?" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Sì, impara dai miei click" })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "No, grazie" })).not.toBeChecked();

  const finish = page.getByRole("button", { name: "Ecco tre viaggi pensati per te" });
  await expect(finish).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("radio", { name: "No, grazie" }).check({ force: true });
  await finish.click();
  await expect(page).toHaveURL(/\/it\/viaggio\/proposte$/);

  const id = await sessionUserId(page);
  const { withDb } = await import("./db.mjs");
  const rows = await withDb(
    (sql) => sql`select granted, text_version from public.user_consents where user_id = ${id} and kind = 'profiling' order by id`,
  );
  expect(rows).toEqual([{ granted: false, text_version: "profiling-2026-10-v1" }]);
});

test("Account › Privacy: il consenso alla profilazione si attiva e si revoca, con il registro", async ({ page, request }) => {
  await signUpWithCode(page, request, "e2e");
  const id = await sessionUserId(page);
  await page.goto("/it/profilo/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy e dati" })).toBeVisible();

  const profiling = page.getByRole("switch", { name: PROFILING });
  await expect(profiling).toHaveAttribute("aria-checked", "false");
  await expect(profiling.locator("xpath=ancestor::li[1]").getByText("Non hai ancora scelto")).toBeVisible();
  await profiling.click();
  await expect(profiling).toHaveAttribute("aria-checked", "true");
  await expect(profiling.locator("xpath=ancestor::li[1]").getByText("Attivo")).toBeVisible();
  await profiling.click();
  await expect(profiling).toHaveAttribute("aria-checked", "false");

  const { withDb } = await import("./db.mjs");
  const rows = await withDb(
    (sql) => sql`select granted from public.user_consents where user_id = ${id} and kind = 'profiling' order by id`,
  );
  // Ogni scelta è una riga nuova: il registro non si modifica.
  expect(rows.map((row) => row.granted)).toEqual([true, false]);
});

test("scarico dei dati: JSON con i dati dell'utente, CSV dei punti", async ({ page, request }) => {
  const email = await signUpWithCode(page, request, "e2e");
  await page.goto("/it/profilo/privacy");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Scarica tutti i dati (JSON)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^isula-dati-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile((await download.path())!, "utf8")) as Record<string, unknown>;
  expect(data.format).toBe("isula-account-export");
  expect(JSON.stringify(data.profile)).toContain(email);
  expect(Array.isArray(data.consents)).toBe(true);

  const csv = await page.request.get("/api/account/export?formato=csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect((await csv.text()).split("\r\n")[0]).toBe('"data","motivo","punti","stagione"');
});

test("eliminazione dell'account: codice da Mailpit, frase di conferma, logout", async ({ page, request }) => {
  const email = await signUpWithCode(page, request, "e2e");
  const id = await sessionUserId(page);
  await page.goto("/it/profilo/privacy");

  await page.getByRole("button", { name: "Inizia l'eliminazione" }).click();
  const send = page.getByRole("button", { name: "Mandami il codice" });
  await expect(send).toBeEnabled({ timeout: 30_000 });
  const before = await lastMessageId(request, email);
  await send.click();
  await expect(page.getByText("Ti abbiamo mandato un codice")).toBeVisible();

  await page.getByLabel("Codice di 6 cifre").fill(await waitForCode(request, email, before));
  await page.getByLabel(`Scrivi ${PHRASE} per confermare`).fill(PHRASE);
  await page.getByRole("button", { name: "Elimina definitivamente l'account" }).click();

  await expect(page).toHaveURL(/\/it\/account-eliminato$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Account eliminato");

  const { withDb } = await import("./db.mjs");
  expect(await withDb((sql) => sql`select 1 from auth.users where id = ${id}`)).toEqual([]);

  // Sessione chiusa: il profilo rimanda al login.
  await page.goto("/it/profilo");
  await expect(page).toHaveURL(/\/it\/login/);
});

test("ospite: elimina i suoi dati con la sola frase di conferma", async ({ page }) => {
  await page.goto("/it/login");
  await page.getByRole("button", { name: "Continua senza account" }).click();
  await expect(page).toHaveURL(/\/it\/profilo$/);
  const id = await sessionUserId(page);

  await page.goto("/it/profilo/privacy");
  await expect(page.getByRole("heading", { level: 2, name: "Elimina i dati dell'ospite" })).toBeVisible();
  await page.getByRole("button", { name: "Inizia l'eliminazione" }).click();
  await page.getByLabel(`Scrivi ${PHRASE} per confermare`).fill(PHRASE);
  await page.getByRole("button", { name: "Elimina i dati dell'ospite" }).click();

  await expect(page).toHaveURL(/\/it\/account-eliminato$/, { timeout: 30_000 });
  const { withDb } = await import("./db.mjs");
  expect(await withDb((sql) => sql`select 1 from auth.users where id = ${id}`)).toEqual([]);
});
