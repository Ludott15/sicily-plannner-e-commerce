import { chooseOption, pickDate } from "./helpers/controls";
import { expect, test, type Page } from "@playwright/test";

// Il menu "Fascia oraria" della nota di una tappa sta dentro il dialog nativo della tappa: il menu
// si apre nel dialog (un portale sotto il top layer resterebbe invisibile).

const TEMPLATE = "demo-weekend-palermo";
const FIRST_STOP = "Street food al mercato di Ballarò";

async function useTemplate(page: Page) {
  await page.goto(`/it/itinerari/${TEMPLATE}`);
  await page.getByRole("link", { name: "Usa questo itinerario" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/it/viaggio/salva\\?da=${TEMPLATE}$`));
  await pickDate(page, "Data di partenza", "2027-05-12");
  await chooseOption(page, "Persone", "4 persone");
  const save = page.getByRole("button", { name: "Salva il viaggio" });
  // Senza sessione serve Turnstile (chiavi di prova: si risolve da solo).
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await save.click();
  await expect(page).toHaveURL(/\/it\/viaggi\/[0-9a-f-]{36}$/);
}

test("la fascia oraria della nota di una tappa si sceglie nel dialog", async ({ page }) => {
  await useTemplate(page);
  await page.getByRole("button", { name: `Azioni per ${FIRST_STOP}` }).click();
  await page.getByRole("menuitem", { name: "Nota e fascia oraria" }).click();

  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await chooseOption(page, "Fascia oraria", "Mattina", dialog);
  await expect(dialog.getByLabel("Fascia oraria")).toHaveText("Mattina");

  await dialog.getByRole("button", { name: "Salva la nota della tappa" }).click();
  await expect(dialog.getByText("Nota della tappa salvata.")).toBeVisible();
});
