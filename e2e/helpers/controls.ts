import { expect, type Locator, type Page } from "@playwright/test";

// Controlli del design system nei test e2e (docs/design/components/Select e DateField).
// Un menu a tendina si apre dal suo pulsante (nome accessibile = label) e si sceglie l'opzione per
// testo. Un campo data si apre su un calendario mensile: il mese si cambia con i pulsanti e il giorno
// si sceglie dalla cella con data-date="YYYY-MM-DD". `scope` limita la ricerca del pulsante a una
// sezione (per esempio una riga di tabella); di default è la pagina.

type Scope = Page | Locator;
type Name = string | RegExp;

export async function chooseOption(page: Page, label: Name, optionText: Name, scope: Scope = page) {
  await scope.getByLabel(label, { exact: typeof label === "string" }).click();
  await page.getByRole("option", { name: optionText, exact: typeof optionText === "string" }).click();
}

export async function pickDate(page: Page, label: Name, isoDate: string, scope: Scope = page) {
  await scope.getByLabel(label, { exact: typeof label === "string" }).click();
  const grid = page.getByRole("grid");
  await grid.waitFor();
  const cell = page.locator(`[data-date="${isoDate}"]`);
  const target = isoDate.slice(0, 7);
  // Al massimo tre anni di mesi: oltre è un errore del test.
  for (let step = 0; step < 36 && (await cell.count()) === 0; step += 1) {
    const shown = (await grid.getAttribute("data-month")) ?? "";
    const direction = shown < target ? "Mese successivo" : "Mese precedente";
    await page.getByRole("button", { name: direction }).click();
  }
  await cell.click();
  await expect(grid).toHaveCount(0);
}
