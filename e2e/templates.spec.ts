import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Itinerari pronti (1.3): i controlli di pubblicazione bloccano lo slug finché manca il ritmo,
// il trascinamento da tastiera sposta una tappa nel giorno 2, la pagina pubblica mostra il
// riepilogo e "Dove dormire", i filtri di /itinerari stanno nell'URL.

async function adminPage(page: Page, request: APIRequestContext) {
  const email = await signUpWithCode(page, request);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);
}

// Crea un itinerario di giorni dati in bozza e torna alla sua pagina di modifica.
async function createDraft(page: Page, title: string, days: string) {
  await page.goto("/it/admin/itinerari/nuovo");
  await page.getByLabel("Titolo", { exact: true }).fill(title);
  await page.getByLabel("Numero di giorni").fill(days);
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Salvato." })).toHaveText("Salvato.");
  return page.url().split("?")[0]!;
}

// Aggiunge una tappa libera (senza attività: non dipende dal catalogo di seed) al giorno indicato.
async function addFreeStop(page: Page, day: number, title: string) {
  const section = page.locator(`#giorno-${day}`);
  await section.getByLabel("Oppure un titolo libero").fill(title);
  await section.getByRole("button", { name: "Aggiungi tappa" }).click();
  await expect(page.locator(`#giorno-${day}`)).toContainText(title);
}

test("admin: senza ritmo l'itinerario non si pubblica, e il controllo sparisce con il ritmo", async ({ page, request }) => {
  await adminPage(page, request);
  const slug = `e2e-ritmo-${Date.now()}`;
  await page.goto("/it/admin/itinerari/nuovo");
  await page.getByLabel("Titolo", { exact: true }).fill("e2e- Ritmo di prova");
  await page.getByLabel("Numero di giorni").fill("1");
  await page.getByLabel("Slug per la pubblicazione").fill(slug);
  await page.getByRole("button", { name: "Salva", exact: true }).click();

  // Con lo slug e senza ritmo, l'itinerario resta in bozza e la pagina elenca il controllo.
  await expect(page.getByText("Scegli il ritmo del viaggio.")).toBeVisible();
  expect((await request.get(`/it/itinerari/${slug}`)).status()).toBe(404);

  // La bozza non tiene lo slug: si richiede la pubblicazione una seconda volta, ora con il ritmo.
  await page.getByLabel("Ritmo", { exact: true }).selectOption("balanced");
  await page.getByLabel("Slug per la pubblicazione").fill(slug);
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  // La pagina può avere più di un alert: si filtra sul messaggio del form.
  await expect(page.getByRole("alert").filter({ hasText: "Non si pubblica" })).toContainText("Non si pubblica");
  await expect(page.getByText("Scegli il ritmo del viaggio.")).toHaveCount(0);
  expect((await request.get(`/it/itinerari/${slug}`)).status()).toBe(404);
});

test("admin: riordino da tastiera e spostamento di una tappa al giorno 2", async ({ page, request }) => {
  await adminPage(page, request);
  await createDraft(page, "e2e- Trascinamento di prova", "2");
  await addFreeStop(page, 1, "e2e- Tappa A");
  await addFreeStop(page, 1, "e2e- Tappa B");
  await addFreeStop(page, 2, "e2e- Tappa C");

  // Trascinamento da tastiera: spazio per prendere la tappa A, freccia giù, spazio per posarla dopo B.
  const day1 = page.locator("#giorno-1 li");
  await day1.filter({ hasText: "e2e- Tappa A" }).getByRole("button", { name: "Trascina per spostare" }).focus();
  // dnd-kit misura le posizioni nei frame successivi: dopo ogni tasto si aspetta l'annuncio.
  const live = page.locator('[id^="DndLiveRegion"]');
  await page.keyboard.press("Space");
  await expect(live).toContainText("Tappa «e2e- Tappa A»");
  await page.keyboard.press("ArrowDown");
  await expect(live).toContainText("sopra la posizione 2 del giorno 1");
  await page.keyboard.press("Space");
  await expect(live).toContainText("posata nel giorno 1, posizione 2");
  await expect(page.getByRole("status").filter({ hasText: "Ordine delle tappe salvato." })).toHaveText("Ordine delle tappe salvato.");
  await expect(day1.first()).toContainText("e2e- Tappa B");

  // Tra i giorni, senza mouse: il select "Sposta al giorno".
  await day1.filter({ hasText: "e2e- Tappa A" }).getByLabel("Sposta al giorno").selectOption({ label: "Giorno 2" });
  await expect(page.locator("#giorno-2")).toContainText("e2e- Tappa A");
  await expect(page.locator("#giorno-1")).not.toContainText("e2e- Tappa A");
});

test("pagina pubblica dell'itinerario: riepilogo e dove dormire", async ({ page }) => {
  await page.goto("/it/itinerari/demo-trapani-erice");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Il riepilogo in testa: durata e ritmo, come voci di un elenco di descrizioni.
  await expect(page.locator("dl").first().getByText("Durata")).toBeVisible();
  await expect(page.getByRole("link", { name: "Usa questo itinerario" }).first()).toBeVisible();
  await expect(page.locator("[data-day-panel]").first().getByText("Dove dormire")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Giorni" }).getByRole("button").first()).toBeVisible();
});

test("itinerari: i filtri stanno nell'URL e i valori sconosciuti si ignorano", async ({ page }) => {
  await page.goto("/it/itinerari");
  await page.getByRole("button", { name: "2-3 giorni" }).click();
  await expect(page).toHaveURL(/giorni=2-3/);
  await page.getByRole("button", { name: "In coppia" }).click();
  await expect(page).toHaveURL(/per=couple/);

  await page.goto("/it/itinerari?giorni=4-5&per=zzz&mese=99");
  await expect(page.getByRole("button", { name: "4-5 giorni" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Da solo" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("status")).toBeVisible();
});
