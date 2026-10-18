import { expect, test, type Page } from "@playwright/test";
import { PENDING_ACTIONS } from "../src/lib/pending-actions";
import { sessionUserId } from "./helpers";

// Azioni dei mockup visibili ma non ancora attive (src/lib/pending-actions.ts).
// Il test confronta le azioni in sospeso trovate nelle pagine con l'elenco atteso:
// quando una milestone implementa un'azione la toglie da entrambi.

const PAGES = [
  "/it",
  "/it/attivita",
  "/it/attivita/demo-zingaro",
  // Shop (passo 7.1): "Aggiungi al carrello" è in sospeso fino al 7.2.
  "/it/shop",
  "/it/itinerari/demo-sicilia-orientale",
  "/it/chi-siamo",
  "/it/privacy",
  "/it/cookie",
  "/it/condizioni-di-vendita",
  "/it/viaggio/nuovo",
  // Verticali del passo 3.1: "in arrivo" finché manca l'ID del partner (vertical.lodging, vertical.car).
  "/it/dove-dormire",
  "/it/noleggio-auto",
  // Classifica (passo 5.3): pubblica, con il link al regolamento dei punti.
  "/it/classifica",
];

// Pagine personali: servono una sessione e risposte salvate. /punti (passo 5.1) per l'ospite mostra
// l'invito a creare l'account e il regolamento in sospeso. Ospite con auto a noleggio e cibo e
// vino al massimo, così i tre viaggi hanno tappe in auto (l'Etna nel seed) e l'avviso del noleggio.
// Cinque giorni: nel seed demo almeno due aree li coprono (Costa nord e Madonie, Interno).
const SESSION_PAGES = ["/it/viaggio/proposte", "/it/preferenze", "/it/punti"];

async function collectFrom(page: Page, paths: string[], found: Map<string, string>) {
  for (const path of paths) {
    await page.goto(path);
    for (const el of await page.locator("[data-pending-id]").all()) {
      const id = (await el.getAttribute("data-pending-id"))!;
      found.set(id, (await el.getAttribute("data-pending"))!);
      await expect(el, id).toHaveAttribute("aria-disabled", "true");
    }
  }
}

async function collectPending(page: Page) {
  const found = new Map<string, string>();
  await collectFrom(page, PAGES, found);

  await page.goto("/it/login");
  await page.getByRole("button", { name: "Continua senza account" }).click();
  await expect(page).toHaveURL(/\/it\/profilo$/);
  const id = await sessionUserId(page);
  const { withDb } = await import("./db.mjs");
  await withDb(async (sql) => {
    await sql`insert into public.user_constraints (user_id, car_access, trip_days) values (${id}, 'rental', 5)`;
    await sql`insert into public.preference_weights (user_id, interest_key, explicit) values (${id}, 'food_wine', 5)`;
    await sql`update public.profiles set onboarding_completed_at = now() where id = ${id}`;
  });
  // Un viaggio dell'ospite: la checklist "Da prenotare" ha i link ai partner in sospeso (M6).
  const [trip] = await withDb((sql) => sql`insert into public.itineraries (owner_id, title, days) values (${id}, 'e2e- Viaggio', 2) returning id`);
  await collectFrom(page, [...SESSION_PAGES, `/it/viaggi/${trip!.id}?scheda=prenotare`], found);
  return found;
}

test("le azioni in sospeso nelle pagine sono esattamente quelle dell'elenco", async ({ page }) => {
  // Quindici pagine in un test: in locale la compilazione a freddo supera i 30 secondi predefiniti.
  test.setTimeout(180_000);
  const found = await collectPending(page);
  expect(Object.fromEntries([...found].sort())).toEqual(Object.fromEntries(Object.entries(PENDING_ACTIONS).sort()));
});

test("un'azione in sospeso non fa nulla", async ({ page }) => {
  await page.goto("/it/dove-dormire");
  const url = page.url();
  await page.locator('[data-pending-id="vertical.lodging"]').first().click({ force: true });
  await expect(page).toHaveURL(url);
});

test("\"Disponibile a breve\" solo in sviluppo", async ({ page }) => {
  test.skip(!process.env.CI, "in locale gli e2e usano il server di sviluppo, dove la riga compare");
  await page.goto("/it/attivita/demo-zingaro");
  await expect(page.getByText("Disponibile a breve")).toHaveCount(0);
});

// Controllo di lancio: prima di andare in produzione nessuna azione può restare in sospeso.
test("prima del lancio l'elenco delle azioni in sospeso è vuoto", async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(process.env.PRE_LAUNCH !== "1", "attivo solo con PRE_LAUNCH=1 sulla build di produzione");
  expect(Object.keys(PENDING_ACTIONS)).toEqual([]);
  expect([...(await collectPending(page)).keys()]).toEqual([]);
  // Testi legali e Chi siamo: con i dati del titolare nessuna pagina mostra l'avviso di preparazione
  // (e le pagine sono indicizzabili, vedi isLegalReady).
  for (const path of ["/it/privacy", "/it/cookie", "/it/condizioni-di-vendita", "/it/termini", "/it/punti/regolamento", "/it/chi-siamo"]) {
    await page.goto(path);
    await expect(page.locator('[data-legal-entity="missing"]'), path).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]'), path).toHaveCount(0);
  }
});
