import { expect, test, type Page } from "@playwright/test";
import { PENDING_ACTIONS } from "../src/lib/pending-actions";

// Azioni dei mockup visibili ma non ancora attive (src/lib/pending-actions.ts).
// Il test confronta le azioni in sospeso trovate nelle pagine con l'elenco atteso:
// quando una milestone implementa un'azione la toglie da entrambi.

const PAGES = ["/it", "/it/attivita", "/it/attivita/demo-zingaro", "/it/itinerari/demo-sicilia-orientale"];

async function collectPending(page: Page) {
  const found = new Map<string, string>();
  for (const path of PAGES) {
    await page.goto(path);
    for (const el of await page.locator("[data-pending-id]").all()) {
      const id = (await el.getAttribute("data-pending-id"))!;
      found.set(id, (await el.getAttribute("data-pending"))!);
      await expect(el, id).toHaveAttribute("aria-disabled", "true");
    }
  }
  return found;
}

test("le azioni in sospeso nelle pagine sono esattamente quelle dell'elenco", async ({ page }) => {
  const found = await collectPending(page);
  expect(Object.fromEntries([...found].sort())).toEqual(Object.fromEntries(Object.entries(PENDING_ACTIONS).sort()));
});

test("un'azione in sospeso non fa nulla", async ({ page }) => {
  await page.goto("/it/itinerari/demo-sicilia-orientale");
  const url = page.url();
  await page.locator('[data-pending-id="itinerary.use"]').first().click({ force: true });
  await expect(page).toHaveURL(url);
});

test("\"Disponibile a breve\" solo in sviluppo", async ({ page }) => {
  test.skip(!process.env.CI, "in locale gli e2e usano il server di sviluppo, dove la riga compare");
  await page.goto("/it/attivita/demo-zingaro");
  await expect(page.getByText("Disponibile a breve")).toHaveCount(0);
});

// Controllo di lancio: prima di andare in produzione nessuna azione può restare in sospeso.
test("prima del lancio l'elenco delle azioni in sospeso è vuoto", async ({ page }) => {
  test.skip(process.env.PRE_LAUNCH !== "1", "attivo solo con PRE_LAUNCH=1 sulla build di produzione");
  expect(Object.keys(PENDING_ACTIONS)).toEqual([]);
  expect([...(await collectPending(page)).keys()]).toEqual([]);
});
