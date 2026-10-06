import { expect, test, type Page } from "@playwright/test";
import { sessionUserId, testEmail, waitForCode } from "./helpers";

// Onboarding (M4): 7 domande anche da ospite, una per indirizzo, risposte conservate al
// ricaricamento; tre viaggi con "Per te"; chi torna con i gusti salvati sceglie solo il
// viaggio in una schermata (parte 5); Preferenze con i soli gusti, mobilità e dieta solo con
// consenso; il profilo resta all'utente nella conversione da ospite ad account.

const FALLBACK = "Tra le più vicine ai tuoi gusti in questa zona";
const next = (page: Page) => page.getByRole("button", { name: "Avanti", exact: true });

async function answerAll(page: Page) {
  await page.goto("/it");
  await page.getByRole("link", { name: "Crea il tuo viaggio" }).first().click();
  await expect(page).toHaveURL(/\/it\/viaggio\/nuovo$/);

  // 1: giorni e mesi. Avanti solo dopo aver scelto i giorni; informativa sotto i pulsanti.
  await expect(page.getByText("Domanda 1 di 7")).toBeVisible();
  await expect(next(page)).toBeDisabled();
  await expect(page.locator('[data-pending-id="onboarding.privacy"]')).toHaveAttribute("data-pending", "testi");
  await expect(page.getByRole("link", { name: "Informativa sulla privacy" })).toHaveAttribute("href", "/it/privacy");
  await page.getByRole("radio", { name: "3 giorni" }).check({ force: true });
  await page.getByRole("button", { name: "giu", exact: true }).click();
  await next(page).click();
  await expect(page).toHaveURL(/domanda=2$/);

  // 2: interessi.
  await page.getByRole("button", { name: "Mare", exact: true }).click();
  await page.getByRole("button", { name: "Cibo e vino", exact: true }).click();
  await page.getByRole("button", { name: "Avanti · 2 scelti" }).click();
  await expect(page).toHaveURL(/domanda=3$/);

  // 3: ogni interesse scelto parte da 3 ("Abbastanza").
  const sea = page.getByRole("radiogroup", { name: "Mare" });
  await expect(page.getByText("Abbastanza")).toHaveCount(2);
  await sea.getByRole("radio", { name: "5 su 5, Moltissimo" }).click();
  await next(page).click();

  // 4-7: ritmo, con chi, aeroporto, budget e auto.
  await page.getByRole("radio", { name: /^Rilassato/ }).check({ force: true });
  await next(page).click();
  await page.getByRole("radio", { name: "In coppia" }).check({ force: true });
  await next(page).click();
  await expect(page.getByText("Domanda 6 di 7")).toBeVisible();
  await page.getByRole("radio", { name: "Catania" }).check({ force: true });
  await next(page).click();
  await page.getByRole("radio", { name: "Fino a 60 €" }).check({ force: true });
  await page.getByRole("radio", { name: /^La noleggio/ }).check({ force: true });
  await page.getByRole("button", { name: "Ecco tre viaggi pensati per te" }).click();
  await expect(page).toHaveURL(/\/it\/viaggio\/proposte$/);
}

test("ospite: sette domande, risposte salvate, tre viaggi con il perché di ogni tappa", async ({ page }) => {
  await answerAll(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ecco tre viaggi pensati per te");
  const trips = page.locator("main section > ol > li");
  expect(await trips.count()).toBeGreaterThanOrEqual(1);
  expect(await trips.count()).toBeLessThanOrEqual(3);
  // Ogni tappa ha "Per te"; il ripiego su meno di un terzo delle tappe (seed).
  const stops = page.locator("li.is-stop");
  const count = await stops.count();
  expect(count).toBeGreaterThan(0);
  await expect(page.locator("li.is-stop .is-why")).toHaveCount(count);
  const fallback = await page.locator("li.is-stop .is-why", { hasText: FALLBACK }).count();
  expect(fallback / count).toBeLessThan(1 / 3);

  const { withDb } = await import("./db.mjs");
  const id = await sessionUserId(page);
  const [row] = await withDb(
    (sql) => sql`
      select u.is_anonymous, c.trip_days, c.trip_months, c.budget_per_day_eur, c.car_access::text as car, c.arrival_airport,
             p.pace::text, p.party::text
      from auth.users u join public.user_constraints c on c.user_id = u.id join public.profiles p on p.id = u.id
      where u.id = ${id}`,
  );
  expect(row).toMatchObject({
    is_anonymous: true,
    trip_days: 3,
    trip_months: [6],
    budget_per_day_eur: 60,
    car: "rental",
    arrival_airport: "CTA",
    pace: "relaxed",
    party: "couple",
  });
  const weights = await withDb(
    (sql) => sql`select interest_key, explicit from public.preference_weights where user_id = ${id} and explicit > 0 order by interest_key`,
  );
  expect(weights).toEqual([
    { interest_key: "food_wine", explicit: 3 },
    { interest_key: "sea", explicit: 5 },
  ]);

  // Con "La noleggio" le tappe in auto sono ammesse; se un viaggio ne ha, lo dice.
  const slugs = await page.locator("li.is-stop .is-stop__title a").evaluateAll((links) =>
    links.map((a) => (a as HTMLAnchorElement).pathname.split("/").pop()!),
  );
  const violations = await withDb(
    (sql) => sql`select slug from public.activities
      where slug = any(${slugs}) and (coalesce(on_site_price_eur, 0) > 60 or not (6 = any(season_months)))`,
  );
  expect(violations).toEqual([]);
  const withCar = await withDb((sql) => sql`select slug from public.activities where slug = any(${slugs}) and requires_car`);
  if (withCar.length > 0) await expect(page.getByText("per questo viaggio serve un'auto a noleggio").first()).toBeVisible();

  // Due link: "Cambia il viaggio" (schermata singola) e "Modifica i tuoi gusti" (Preferenze).
  await expect(page.getByRole("link", { name: "Cambia preferenze" })).toHaveCount(0);
  await page.getByRole("link", { name: "Modifica i tuoi gusti" }).click();
  await expect(page).toHaveURL(/\/it\/preferenze$/);
  await page.goBack();
  await page.getByRole("link", { name: "Cambia il viaggio" }).click();
  await expect(page).toHaveURL(/\/it\/viaggio\/nuovo$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Il tuo prossimo viaggio");
});

test("lo stesso ospite che torna: una sola schermata con il viaggio precompilato e il riepilogo dei gusti", async ({ page }) => {
  await answerAll(page);
  const id = await sessionUserId(page);
  await page.goto("/it/viaggio/nuovo");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Il tuo prossimo viaggio");
  await expect(page.getByText(/Domanda \d di 7/)).toHaveCount(0);
  // Valori del viaggio di prima.
  await expect(page.getByRole("radio", { name: "3 giorni" })).toBeChecked();
  await expect(page.getByRole("button", { name: "giu", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("radio", { name: "In coppia" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Catania" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Fino a 60 €" })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^La noleggio/ })).toBeChecked();
  // Riepilogo dei gusti, senza i campi dei gusti.
  const tastes = page.getByRole("region", { name: "I tuoi gusti" });
  await expect(tastes).toContainText("Mare · Moltissimo");
  await expect(tastes).toContainText("Cibo e vino · Abbastanza");
  await expect(tastes).toContainText("Ritmo: Rilassato");
  await expect(page.getByRole("heading", { name: "Quanto conta ognuno?" })).toHaveCount(0);
  await expect(tastes.getByRole("link", { name: "Modifica i gusti" })).toHaveAttribute("href", "/it/preferenze");

  // Cambia solo il viaggio: i gusti restano.
  await page.getByRole("radio", { name: "5 giorni" }).check({ force: true });
  await page.getByRole("radio", { name: "Palermo" }).check({ force: true });
  await page.getByRole("button", { name: "Ecco tre viaggi pensati per te" }).click();
  await expect(page).toHaveURL(/\/it\/viaggio\/proposte$/);
  const { withDb } = await import("./db.mjs");
  const [row] = await withDb(
    (sql) => sql`select c.trip_days, c.arrival_airport, p.pace::text, p.party::text,
      (select count(*)::int from public.preference_weights w where w.user_id = c.user_id and w.explicit > 0) as weights
      from public.user_constraints c join public.profiles p on p.id = c.user_id where c.user_id = ${id}`,
  );
  expect(row).toMatchObject({ trip_days: 5, arrival_airport: "PMO", pace: "relaxed", party: "couple", weights: 2 });

  // Indietro del browser: si torna alla schermata singola, mai a una domanda del percorso.
  await page.goBack();
  await expect(page).toHaveURL(/\/it\/viaggio\/nuovo$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Il tuo prossimo viaggio");
  await expect(page.getByRole("radio", { name: "5 giorni" })).toBeChecked();
});

test("Indietro dai tre viaggi dopo il percorso completo: la schermata singola, non la domanda 7", async ({ page }) => {
  await answerAll(page);
  await page.goBack();
  await expect(page).toHaveURL(/domanda=7$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Il tuo prossimo viaggio");
  await expect(page.getByText(/Domanda \d di 7/)).toHaveCount(0);
});

test("Preferenze senza gusti salvati: una frase e \"Crea il tuo viaggio\"", async ({ page }) => {
  await page.goto("/it/login");
  await page.getByRole("button", { name: "Continua senza account" }).click();
  await expect(page).toHaveURL(/\/it\/profilo$/);
  await page.getByRole("banner").getByRole("link", { name: "Preferenze", exact: true }).click();
  await expect(page).toHaveURL(/\/it\/preferenze$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("I tuoi gusti");
  await page.getByRole("main").getByRole("link", { name: "Crea il tuo viaggio" }).click();
  await expect(page.getByText("Domanda 1 di 7")).toBeVisible();
});

test("domanda 3: il pallino più alto azzera, la riga resta con \"Non conta\"; nuovo clic la riporta", async ({ page }) => {
  await page.goto("/it/viaggio/nuovo?domanda=2");
  await page.getByRole("button", { name: "Arte", exact: true }).click();
  await page.getByRole("button", { name: "Avanti · 1 scelto" }).click();
  const art = page.getByRole("radiogroup", { name: "Arte" });
  await art.getByRole("radio", { name: /^3 su 5/ }).click();
  // Il 3 era già il valore: un nuovo clic sul più alto riempito azzera.
  await expect(page.getByText("Non conta")).toBeVisible();
  await expect(art).toBeVisible();
  await art.getByRole("radio", { name: /^5 su 5/ }).click();
  await expect(page.getByText("Moltissimo")).toBeVisible();
  await art.getByRole("radio", { name: /^5 su 5/ }).click();
  await expect(page.getByText("Non conta")).toBeVisible();
  await expect(art.getByRole("radio")).toHaveCount(5);
});

test("risposte e domanda corrente restano dopo il ricaricamento; Indietro del browser torna alla domanda prima", async ({ page }) => {
  await page.goto("/it/viaggio/nuovo");
  await page.getByRole("radio", { name: "5 giorni" }).check({ force: true });
  await next(page).click();
  await expect(page).toHaveURL(/domanda=2$/);
  await page.getByRole("button", { name: "Borghi", exact: true }).click();
  await page.reload();
  await expect(page.getByText("Domanda 2 di 7")).toBeVisible();
  await expect(page.getByRole("button", { name: "Borghi", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(page.getByText("Domanda 1 di 7")).toBeVisible();
  await expect(page.getByRole("radio", { name: "5 giorni" })).toBeChecked();
});

test("domanda 3 a 360 e 390 px: niente scorrimento orizzontale", async ({ page }) => {
  await page.goto("/it/viaggio/nuovo?domanda=2");
  for (const name of ["Mare", "Natura ed escursioni", "Storia e archeologia", "Esperienze locali"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await page.getByRole("button", { name: /^Avanti · 4/ }).click();
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px`).toBeLessThanOrEqual(0);
  }
});

test("saltando tutto: tre viaggi per cominciare, senza \"Per te\"", async ({ page }) => {
  await page.goto("/it/viaggio/nuovo");
  for (let i = 1; i <= 7; i++) {
    await expect(page.getByText(`Domanda ${i} di 7`)).toBeVisible();
    const skip = page.getByRole("button", { name: "Salta" });
    await expect(skip).toBeEnabled();
    await skip.click();
  }
  await expect(page).toHaveURL(/\/it\/viaggio\/proposte$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Non ci hai detto molto: ecco tre viaggi per cominciare");
  await expect(page.locator(".is-why")).toHaveCount(0);
});

test("Preferenze: mobilità e dieta solo con consenso, e si cancellano", async ({ page }) => {
  await answerAll(page);
  const { withDb } = await import("./db.mjs");
  const id = await sessionUserId(page);
  await page.goto("/it/preferenze");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("I tuoi gusti");
  await expect(page.getByText("Valgono per tutti i tuoi viaggi.", { exact: false })).toBeVisible();
  // Solo i gusti: nessun campo del viaggio.
  for (const name of ["Quanti giorni, e quando?", "Con chi viaggi?", "Dove atterri?", "Budget e spostamenti"]) {
    await expect(page.getByRole("heading", { name }), name).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: "Quanto conta ognuno?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Che ritmo ti piace?" })).toBeVisible();
  await expect(page.locator('[data-pending-id="preferences.consent"]')).toHaveAttribute("data-pending", "testi");
  const mobility = page.getByRole("checkbox", { name: "Mobilità ridotta: solo attività accessibili" });
  await expect(mobility).toBeDisabled();
  await page.getByRole("checkbox", { name: "Testo in preparazione." }).check();
  await mobility.check();
  await page.getByRole("checkbox", { name: "Vegana" }).check();
  await page.getByRole("button", { name: "Salva i gusti" }).click();
  await expect(page.getByRole("status")).toHaveText("Gusti salvati.");
  const [saved] = await withDb(
    (sql) => sql`select reduced_mobility, diet, sensitive_consent_at is not null as consent from public.user_constraints where user_id = ${id}`,
  );
  expect(saved).toMatchObject({ reduced_mobility: true, diet: ["vegan"], consent: true });

  await page.getByRole("button", { name: "Cancella mobilità e dieta" }).click();
  await expect(page).toHaveURL(/cancellati=1$/, { timeout: 30_000 });
  await expect(page.getByRole("status")).toHaveText("Mobilità e dieta cancellate.");
  const [cleared] = await withDb(
    (sql) => sql`select reduced_mobility, diet, sensitive_consent_at, car_access::text as car from public.user_constraints where user_id = ${id}`,
  );
  expect(cleared).toMatchObject({ reduced_mobility: false, diet: [], sensitive_consent_at: null, car: "rental" });
});

test("il profilo resta all'utente nella conversione da ospite ad account", async ({ page, request }) => {
  await answerAll(page);
  const guestId = await sessionUserId(page);

  const email = testEmail();
  await page.goto("/it/profilo");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Mandami il codice" }).click();
  await page.getByLabel("Codice di 6 cifre").fill(await waitForCode(request, email));
  await page.getByRole("button", { name: "Salva il mio account" }).click();
  await expect(page.getByRole("heading", { name: "Il tuo profilo" })).toBeVisible();
  expect(await sessionUserId(page)).toBe(guestId);

  const { withDb } = await import("./db.mjs");
  const [row] = await withDb(
    (sql) => sql`
      select u.is_anonymous, c.trip_days, c.arrival_airport,
        (select count(*)::int from public.preference_weights w where w.user_id = u.id and w.explicit > 0) as weights
      from auth.users u join public.user_constraints c on c.user_id = u.id where u.id = ${guestId}`,
  );
  expect(row).toMatchObject({ is_anonymous: false, trip_days: 3, arrival_airport: "CTA", weights: 2 });

  await page.goto("/it/viaggio/proposte");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ecco tre viaggi pensati per te");
});

test("senza risposte la pagina dei viaggi porta all'onboarding", async ({ page }) => {
  await page.goto("/it/viaggio/proposte");
  await expect(page).toHaveURL(/\/it\/viaggio\/nuovo$/);
});
