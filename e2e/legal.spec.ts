import { expect, test } from "@playwright/test";

// Testi legali e contatti (passo 8.3): pagine con data e versione, nessun segnaposto, link dal
// footer, dall'accesso, dalla recensione e dalla pagina prodotto, modulo di contatto.
// In CI i dati del titolare non sono configurati: le pagine legali mostrano l'avviso di preparazione
// e restano noindex (pages.spec.ts). Qui si controlla il contenuto, non i dati.

const LEGAL = [
  { path: "/it/termini", heading: "Termini d'uso" },
  { path: "/it/punti/regolamento", heading: "Regolamento dei punti" },
  { path: "/it/chi-siamo", heading: "Chi siamo" },
  { path: "/it/privacy", heading: "Privacy" },
  { path: "/it/cookie", heading: "Cookie" },
  { path: "/it/condizioni-di-vendita", heading: "Condizioni di vendita" },
];

test("pagine legali: titolo, data e versione, nessun segnaposto né parentesi quadre", async ({ page }) => {
  // Sei pagine: in locale la prima visita a ciascuna la compila (come in onboarding.spec.ts).
  test.setTimeout(120_000);
  for (const { path, heading } of LEGAL) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(heading);
    await expect(page.locator("main"), path).toContainText(/Aggiornato il .+ · versione 1/);
    const text = await page.locator("main").innerText();
    expect(text, path).not.toMatch(/\{\{|\}\}|\[|\]/);
  }
});

test("pagine legali in inglese: testo italiano con l'avviso", async ({ page }) => {
  await page.goto("/en/termini");
  await expect(page.locator("main")).toContainText("Available in Italian only.");
});

test("footer: Termini d'uso e Contatti", async ({ page }) => {
  await page.goto("/it");
  await page.getByRole("navigation", { name: "Piè di pagina" }).getByRole("link", { name: "Termini d'uso", exact: true }).click();
  await expect(page).toHaveURL(/\/it\/termini$/);
  await page.goto("/it");
  await page.getByRole("navigation", { name: "Piè di pagina" }).getByRole("link", { name: "Contatti", exact: true }).click();
  await expect(page).toHaveURL(/\/it\/contatti$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contatti");
});

test("accesso: accordo con i termini e l'informativa, con i link", async ({ page }) => {
  await page.goto("/it/login");
  // Il footer ha gli stessi link: si controlla il contenuto della pagina, non il piè di pagina.
  const content = page.getByRole("main");
  await expect(content.getByRole("link", { name: "Termini d'uso", exact: true })).toHaveAttribute("href", "/it/termini");
  await expect(content.getByRole("link", { name: "Informativa privacy", exact: true })).toHaveAttribute("href", "/it/privacy");
});

test("pagina prodotto: avviso di recesso con il link alle condizioni di vendita", async ({ page }) => {
  await page.goto("/it/prodotti/demo-box-sicilia");
  await expect(page.getByRole("note").filter({ hasText: "per recedere" })).toBeVisible();
  await expect(page.getByRole("link", { name: "condizioni di vendita", exact: true })).toHaveAttribute("href", "/it/condizioni-di-vendita");
});

test.describe("modulo di contatto", () => {
  test("campi con etichetta, invio disabilitato senza verifica, nessuno scorrimento a 390 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/it/contatti");
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Di cosa si tratta")).toBeVisible();
    await expect(page.getByLabel("Messaggio")).toBeVisible();
    await expect(page.getByRole("button", { name: "Invia il messaggio" })).toBeDisabled();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test("invio: senza un canale email configurato l'esito è mostrato all'utente", async ({ page }) => {
    await page.goto("/it/contatti");
    const submit = page.getByRole("button", { name: "Invia il messaggio" });
    await page.getByLabel("Email", { exact: true }).fill(`e2e-contatto-${Date.now()}@example.com`);
    await page.getByLabel("Messaggio").fill("Vorrei sapere se il tour dell'Etna parte anche in bassa stagione.");
    // Il bottone si attiva con email e messaggio e con il token Turnstile (chiave di prova).
    await expect(submit).toBeEnabled({ timeout: 30_000 });
    await submit.click();
    // Next usa un proprio elemento role="alert" (il route announcer): si cerca quello del modulo.
    await expect(page.getByRole("alert").filter({ hasText: /non è disponibile|non è partito/ })).toBeVisible();
  });
});
