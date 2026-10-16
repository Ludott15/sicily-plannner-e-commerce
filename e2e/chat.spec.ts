import { expect, test, type Page } from "@playwright/test";
import { signUpWithCode, sessionUserId } from "./helpers";

// Assistente (passo 9.1). Il server usa il modello di prova (CHAT_TEST_MODEL=scripted, mai su Vercel):
// "attività" cerca attività e risponde con le schede; "aggiungi" propone una modifica al viaggio;
// "gusti" propone un aggiornamento dei gusti; "errore" fa fallire la risposta.

const TEMPLATE = "demo-weekend-palermo";

async function send(page: Page, text: string) {
  const box = page.getByLabel("Scrivi all'assistente");
  await expect(box).toBeEnabled();
  await box.fill(text);
  await page.getByRole("button", { name: "Invia" }).click();
}

// Viaggio di prova dal modello di itinerario pronto, come ospite (stesso flusso del builder).
async function useTemplate(page: Page) {
  await page.goto(`/it/itinerari/${TEMPLATE}`);
  await page.getByRole("link", { name: "Usa questo itinerario" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/it/viaggio/salva\\?da=${TEMPLATE}$`));
  await page.getByLabel("Data di partenza").fill("2027-05-12");
  await page.getByLabel("Persone").selectOption("4");
  const save = page.getByRole("button", { name: "Salva il viaggio" });
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await save.click();
  await expect(page).toHaveURL(/\/it\/viaggi\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test("assistente: schede attività, proposta sui gusti rifiutata, errore con Riprova", async ({ page, request }) => {
  await signUpWithCode(page, request);
  await page.goto("/it/chat?nuova=1");
  await expect(page.getByRole("heading", { level: 1, name: "Assistente" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Da dove partire" })).toBeVisible();

  await send(page, "Quali attività ci sono a Palermo?");
  await expect(page.getByRole("link", { name: /^Vedi/ }).first()).toBeVisible({ timeout: 30_000 });
  // Dopo la prima risposta l'indirizzo è quello della conversazione salvata.
  await expect(page).toHaveURL(/\/it\/chat\/[0-9a-f-]{36}$/);
  const sessionPath = new URL(page.url()).pathname;
  // Nessun URL scritto dal modello nel testo.
  await expect(page.getByRole("log").filter({ hasText: "http" })).toHaveCount(0);

  await send(page, "Mi piacciono la natura e il cibo: aggiorna i miei gusti");
  await expect(page.getByRole("heading", { name: "Aggiornamento dei gusti" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Rifiuta" }).click();
  await expect(page.getByText("Proposta rifiutata.")).toBeVisible();

  await send(page, "errore");
  await expect(page.getByRole("alert").filter({ hasText: "Non siamo riusciti a rispondere" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Riprova" })).toBeVisible();

  // La conversazione salvata compare nell'elenco.
  await page.goto("/it/chat");
  // Il titolo lo sceglie il modello breve dopo la prima risposta: si cerca il link della sessione.
  await expect(page.locator(`main a[href="${sessionPath}"]`)).toBeVisible();
});

test("assistente dal viaggio: la modifica proposta si accetta e aggiunge la tappa", async ({ page }) => {
  const tripId = await useTemplate(page);
  const { withDb } = await import("./db.mjs");
  const count = async () =>
    (await withDb((sql) => sql`select count(*)::int as n from public.itinerary_items where itinerary_id = ${tripId}`))[0]?.n ?? -1;
  const before = await count();

  await page.getByRole("button", { name: "Chiedi all'assistente" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: /Assistente per/ })).toBeVisible();
  await panel.getByLabel("Scrivi all'assistente").fill("Aggiungi una tappa per il mare");
  await panel.getByRole("button", { name: "Invia" }).click();

  const accept = panel.getByRole("button", { name: "Accetta" });
  await expect(accept).toBeVisible({ timeout: 30_000 });
  await accept.click();
  await expect(panel.getByText("Modifica applicata al viaggio.")).toBeVisible();
  expect(await count()).toBe(before + 1);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("admin: la pagina Assistente mostra costi e conversazioni", async ({ page, request }) => {
  const email = await signUpWithCode(page, request);
  const userId = await sessionUserId(page);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = ${userId}`);
  expect(email).toContain("@example.com");

  await page.goto("/it/admin/ai");
  await expect(page.getByRole("heading", { level: 1, name: "Assistente: costi e conversazioni" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Costo per giorno" })).toBeVisible();
});
