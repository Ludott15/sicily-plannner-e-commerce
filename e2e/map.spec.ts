import { expect, test, type Locator, type Page } from "@playwright/test";

// Mappa dell'itinerario pronto (6.2). L'itinerario demo ha tappe con coordinate del seed. Il test non
// dipende dalle tile: i marker verificati sono quelli dell'elenco numerato (sempre nel DOM), e il canvas
// di MapLibre c'è appena la mappa entra nello schermo, con o senza rete.

const ITINERARY = "/it/itinerari/demo-sicilia-orientale";

// La mappa visibile di un giorno (su desktop la colonna laterale, su mobile il <details>, se aperto).
function visibleDayMap(page: Page, day: number): Locator {
  return page.locator(`section[aria-label="Mappa del giorno ${day}"]:visible`);
}

// Su mobile la mappa sta in un <details> chiuso: lo si apre (quello del giorno visibile).
async function showDayMap(page: Page, day: number): Promise<Locator> {
  const map = visibleDayMap(page, day);
  if ((await map.count()) === 0) {
    await page.locator("details.is-map-printable:visible > summary").click();
  }
  await expect(map).toBeVisible();
  return map;
}

test.describe("mappa dell'itinerario pronto", () => {
  test("la mappa del giorno elenca i punti numerati e cambia con il giorno", async ({ page }) => {
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    await page.goto(ITINERARY);

    const day1 = await showDayMap(page, 1);
    await day1.scrollIntoViewIfNeeded();
    await expect(day1).toHaveAttribute("data-state", /loading|ready|error/);
    await expect(day1.locator(".is-map__canvas canvas")).toHaveCount(1);

    // I punti del giorno 1 sono numerati a partire da 1, come le tappe.
    await expect(day1.locator("ol li").first()).toHaveText(/^Tappa 1: /);

    // Cambio di giorno: la mappa visibile è quella del giorno scelto.
    await page.locator(".is-days button").nth(1).click();
    const day2 = await showDayMap(page, 2);
    await expect(day2.locator("ol li").first()).toHaveText(/^Tappa 1: /);
    await expect(page.locator('section[aria-label="Mappa del giorno 1"]:visible')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test("nessun cookie di terze parti dopo il caricamento della mappa", async ({ page, context }) => {
    await page.goto(ITINERARY);
    const host = new URL(page.url()).hostname;
    const day1 = await showDayMap(page, 1);
    await day1.scrollIntoViewIfNeeded();
    await expect(day1).toHaveAttribute("data-state", /loading|ready|error/);

    const thirdParty = (await context.cookies()).filter((cookie) => cookie.domain.replace(/^\./, "") !== host);
    expect(thirdParty).toEqual([]);
  });

  test("in stampa la lista numerata sostituisce la mappa", async ({ page }) => {
    await page.goto(ITINERARY);
    await page.emulateMedia({ media: "print" });

    // Il canvas non si stampa; l'elenco dei punti del giorno 1 sì.
    const list = page.locator('section[aria-label="Mappa del giorno 1"]:visible ol').first();
    await expect(list).toBeVisible();
    await expect(list.locator("li").first()).toHaveText(/^Tappa 1: /);
    await expect(page.locator(".is-map__canvas canvas").first()).toBeHidden();
  });
});
