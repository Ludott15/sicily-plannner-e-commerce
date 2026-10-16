import { expect, test, type Page } from "@playwright/test";
import { sessionUserId, signUpWithCode } from "./helpers";

// App installabile (passo 11.3). Gli utenti sono e2e-…@example.com e i viaggi hanno il prefisso
// "e2e- " nel titolo: la pulizia globale li elimina. Il database si prepara con withDb (import
// dinamico, vedi e2e/db.mjs). I viaggi demo sono quelli di points.spec.ts.

const ZINGARO = "demo-zingaro";
// Browser interno di TikTok (user agent come in src/lib/in-app-browser.test.ts).
const TIKTOK_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_36.0.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/it Region/IT BytedanceWebview/d8a21c6";
const INSTALL_TITLE = "Usa Isula come app";

// Data di oggi nel fuso di Roma, come YYYY-MM-DD (come romeToday nel server).
function romeToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Viaggio vuoto dell'utente, con partenza opzionale.
async function insertEmptyTrip(ownerId: string, title: string, startDate: string | null) {
  const { withDb } = await import("./db.mjs");
  return withDb(async (sql) => {
    const [trip] = await sql`
      insert into public.itineraries (owner_id, title, days, start_date)
      values (${ownerId}, ${title}, 1, ${startDate})
      returning id`;
    return trip!.id as string;
  });
}

// Viaggio dell'utente con due tappe demo (Zingaro con luogo e un'altra attività con luogo), come
// tripWithPlaces in points.spec.ts, più la data di partenza. Ritorna id, coordinate e titoli delle tappe.
async function insertTripWithPlaces(ownerId: string, title: string, startDate: string | null) {
  const { withDb } = await import("./db.mjs");
  return withDb(async (sql) => {
    const [zingaro] = await sql`
      select a.id as "activityId", a.title, a.place_id as "placeId", p.lat, p.lng
      from public.activities a join public.places p on p.id = a.place_id
      where a.slug = ${ZINGARO}`;
    const [other] = await sql`
      select a.id as "activityId", a.title, a.place_id as "placeId"
      from public.activities a
      where a.slug <> ${ZINGARO} and a.slug like 'demo-%' and a.is_active
        and a.place_id is not null and a.place_id <> ${zingaro!.placeId}
      order by a.slug
      limit 1`;
    const [trip] = await sql`
      insert into public.itineraries (owner_id, title, days, start_date)
      values (${ownerId}, ${title}, 1, ${startDate})
      returning id`;
    await sql`
      insert into public.itinerary_items (itinerary_id, day_index, position, activity_id, place_id)
      values (${trip!.id}, 0, 0, ${zingaro!.activityId}, ${zingaro!.placeId}),
             (${trip!.id}, 0, 1, ${other!.activityId}, ${other!.placeId})`;
    return {
      tripId: trip!.id as string,
      lat: zingaro!.lat as number,
      lng: zingaro!.lng as number,
      titles: [zingaro!.title as string, other!.title as string],
    };
  });
}

// Attende che il service worker sia attivo e controlli la pagina (ricarica una volta se serve).
async function waitForServiceWorkerControl(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  }
}

// Pagine di viaggio presenti nella cache del service worker (isula-pages-v1).
async function cachedTripUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cache = await caches.open("isula-pages-v1");
    return (await cache.keys()).map((request) => request.url).filter((url) => url.includes("/viaggi/"));
  });
}

test("manifest e service worker rispondono", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect(await manifest.json()).toMatchObject({ display: "standalone" });

  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(sw.headers()["cache-control"]).toContain("no-store");
});

test("la pagina offline è raggiungibile e non va indicizzata", async ({ page }) => {
  await page.goto("/it/offline");
  await expect(page.getByRole("heading", { level: 1, name: "Sei offline" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("browser interno di Instagram: il login mostra il suggerimento", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0.0",
  });
  const page = await context.newPage();
  await page.goto("/it/login");
  await expect(page.locator('[data-in-app-browser="instagram"]')).toBeVisible();
  await context.close();
});

test("browser interno di TikTok: il login mostra il suggerimento", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: TIKTOK_UA });
  const page = await context.newPage();
  await page.goto("/it/login");
  await expect(page.locator('[data-in-app-browser="tiktok"]')).toBeVisible();
  await context.close();
});

test("Oggi: un viaggio che parte oggi mostra le tappe del giorno con i link alle mappe", async ({ page, request }) => {
  await signUpWithCode(page, request);
  const id = await sessionUserId(page);
  const { tripId, titles } = await insertTripWithPlaces(id, "e2e- Oggi", romeToday());

  await page.goto(`/it/viaggi/${tripId}`);
  await expect(page.getByRole("heading", { name: "Oggi · Giorno 1" })).toBeVisible();
  await expect(page.getByText(titles[0]!).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Apri in Google Maps" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Apri in Mappe di Apple" }).first()).toBeVisible();
});

test("invito all'installazione: con un viaggio non compare, con due sì", async ({ page, request }) => {
  await signUpWithCode(page, request);
  const id = await sessionUserId(page);
  await insertEmptyTrip(id, "e2e- Primo", null);

  await page.goto("/it/viaggi");
  await expect(page.getByRole("link", { name: "e2e- Primo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: INSTALL_TITLE })).toHaveCount(0);

  await insertEmptyTrip(id, "e2e- Secondo", null);
  await page.goto("/it/viaggi");
  await expect(page.getByRole("heading", { name: INSTALL_TITLE })).toBeVisible();
  // Il componente tollera un evento senza prompt(): l'invito resta com'è.
  await page.evaluate(() => window.dispatchEvent(new Event("beforeinstallprompt")));
  await expect(page.getByRole("heading", { name: INSTALL_TITLE })).toBeVisible();
});

test("UA TikTok: con due viaggi l'invito non compare", async ({ browser, page, request }) => {
  await signUpWithCode(page, request);
  const id = await sessionUserId(page);
  await insertEmptyTrip(id, "e2e- Primo", null);
  await insertEmptyTrip(id, "e2e- Secondo", null);

  // Stessa sessione, ma nel browser interno di TikTok.
  const context = await browser.newContext({ userAgent: TIKTOK_UA, storageState: await page.context().storageState() });
  const inApp = await context.newPage();
  await inApp.goto("/it/viaggi");
  await expect(inApp.getByRole("link", { name: "e2e- Primo" })).toBeVisible();
  await expect(inApp.getByRole("heading", { name: INSTALL_TITLE })).toHaveCount(0);
  await context.close();
});

test("offline: il viaggio salvato si riapre con le tappe e il banner", async ({ page, request, context }) => {
  test.skip(!process.env.CI, "Il service worker si registra solo nella build di produzione (in CI).");
  await signUpWithCode(page, request);
  const id = await sessionUserId(page);
  const { tripId, titles } = await insertTripWithPlaces(id, "e2e- Offline", romeToday());

  await page.goto("/it");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.goto(`/it/viaggi/${tripId}`);
  await expect(page.getByText(titles[0]!).first()).toBeVisible();
  await waitForServiceWorkerControl(page);
  // Ricarica con il service worker attivo: la pagina entra nella cache del viaggio.
  await page.reload();
  await expect(page.getByText(titles[0]!).first()).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(titles[0]!).first()).toBeVisible();
  await expect(page.getByText(titles[1]!).first()).toBeVisible();
  await expect(page.getByText("Sei offline: stai vedendo l'ultima versione salvata.")).toBeVisible();
  await context.setOffline(false);
});

test("offline: dopo l'uscita il viaggio esce dalla cache e il secondo utente non lo vede", async ({ page, request, context }) => {
  test.skip(!process.env.CI, "Il service worker si registra solo nella build di produzione (in CI).");
  await signUpWithCode(page, request);
  const id = await sessionUserId(page);
  const { tripId, titles } = await insertTripWithPlaces(id, "e2e- Uscita", romeToday());

  await page.goto("/it");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.goto(`/it/viaggi/${tripId}`);
  await expect(page.getByText(titles[0]!).first()).toBeVisible();
  await waitForServiceWorkerControl(page);
  await page.reload();
  await expect.poll(() => cachedTripUrls(page)).not.toEqual([]);

  // Uscita dal profilo (navigazione interna): la sessione vuota fa uscire i viaggi dalla cache.
  await page.goto("/it/profilo");
  await page.locator("main").getByRole("button", { name: "Esci", exact: true }).click();
  await expect(page).toHaveURL(/\/it$/);
  await expect.poll(() => cachedTripUrls(page)).toEqual([]);

  // Secondo utente nello stesso contesto: offline non vede il viaggio del primo.
  await signUpWithCode(page, request);
  await expect.poll(() => cachedTripUrls(page)).toEqual([]);
  await context.setOffline(true);
  await page.goto(`/it/viaggi/${tripId}`);
  await expect(page.getByRole("heading", { name: "Sei offline" })).toBeVisible();
  await expect(page.getByText(titles[0]!)).toHaveCount(0);
  await context.setOffline(false);
});
