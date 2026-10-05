import { expect, test, type Page } from "@playwright/test";
import { sessionUserId, testEmail, waitForCode } from "./helpers";

// Onboarding (M4, parte 1): 6 domande anche da ospite, risposte salvate in user_constraints,
// profiles e preference_weights, tre viaggi dal catalogo con "Per te" su ogni tappa. Il profilo
// resta all'utente nella conversione da ospite ad account.

async function answerAll(page: Page) {
  await page.goto("/it");
  await page.getByRole("link", { name: "Crea il tuo viaggio" }).first().click();
  await expect(page).toHaveURL(/\/it\/viaggio\/nuovo$/);

  // Domanda 1: informativa in sospeso con il link alla privacy, giorni e mesi.
  await expect(page.getByText("Domanda 1 di 6")).toBeVisible();
  await expect(page.locator('[data-pending-id="onboarding.privacy"]')).toHaveAttribute("data-pending", "testi");
  await expect(page.getByRole("link", { name: "Informativa sulla privacy" })).toHaveAttribute("href", "/it/privacy");
  await page.getByRole("radio", { name: "3 giorni" }).check({ force: true });
  await page.getByRole("button", { name: "giu", exact: true }).click();
  await page.getByRole("button", { name: "Avanti", exact: true }).click();

  // Domanda 2: interessi con i chip.
  await expect(page.getByText("Domanda 2 di 6")).toBeVisible();
  await page.getByRole("button", { name: "Mare", exact: true }).click();
  await page.getByRole("button", { name: "Cibo e vino", exact: true }).click();
  await page.getByRole("button", { name: "Avanti · 2 scelti" }).click();

  // Domanda 3: quanto conta ognuno (0-5).
  await page.getByRole("radiogroup", { name: "Mare" }).getByRole("radio", { name: "5 su 5" }).click();
  await page.getByRole("button", { name: "Avanti", exact: true }).click();

  // Domande 4-6: ritmo, con chi, budget e auto.
  await page.getByRole("radio", { name: /^Rilassato/ }).check({ force: true });
  await page.getByRole("button", { name: "Avanti", exact: true }).click();
  await page.getByRole("radio", { name: "In coppia" }).check({ force: true });
  await page.getByRole("button", { name: "Avanti", exact: true }).click();
  await page.getByRole("radio", { name: "Fino a 60 €" }).check({ force: true });
  await page.getByRole("radio", { name: "No", exact: true }).check({ force: true });
  await page.getByRole("button", { name: "Ecco tre viaggi pensati per te" }).click();
  await expect(page).toHaveURL(/\/it\/viaggio\/proposte$/);
}

test("ospite: sei domande, risposte salvate, tre viaggi con il perché di ogni tappa", async ({ page }) => {
  await answerAll(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ecco tre viaggi pensati per te");
  const trips = page.locator("main section > ol > li");
  expect(await trips.count()).toBeGreaterThanOrEqual(1);
  expect(await trips.count()).toBeLessThanOrEqual(3);
  // Ogni tappa ha "Per te" con almeno un motivo.
  const stops = page.locator("li.is-stop");
  const count = await stops.count();
  expect(count).toBeGreaterThan(0);
  await expect(page.locator("li.is-stop .is-why")).toHaveCount(count);
  await expect(page.locator("li.is-stop .is-why b").first()).toHaveText("Per te");

  // Risposte salvate per l'ospite, nelle tabelle della spec.
  const { withDb } = await import("./db.mjs");
  const id = await sessionUserId(page);
  const [row] = await withDb(
    (sql) => sql`
      select u.is_anonymous, c.trip_days, c.trip_months, c.budget_per_day_eur, c.has_car, p.pace::text, p.party::text,
             p.onboarding_completed_at is not null as completed
      from auth.users u join public.user_constraints c on c.user_id = u.id join public.profiles p on p.id = u.id
      where u.id = ${id}`,
  );
  expect(row).toMatchObject({
    is_anonymous: true,
    trip_days: 3,
    trip_months: [6],
    budget_per_day_eur: 60,
    has_car: false,
    pace: "relaxed",
    party: "couple",
    completed: true,
  });
  const weights = await withDb(
    (sql) => sql`select interest_key, explicit from public.preference_weights where user_id = ${id} and explicit > 0 order by interest_key`,
  );
  expect(weights).toEqual([
    { interest_key: "food_wine", explicit: 3 },
    { interest_key: "sea", explicit: 5 },
  ]);

  // Nessuna tappa viola i vincoli: niente auto, dentro il budget, nella stagione scelta.
  const slugs = await page.locator("li.is-stop .is-stop__title a").evaluateAll((links) =>
    links.map((a) => (a as HTMLAnchorElement).pathname.split("/").pop()!),
  );
  const violations = await withDb(
    (sql) => sql`
      select slug from public.activities
      where slug = any(${slugs})
        and (requires_car or coalesce(on_site_price_eur, 0) > 60 or not (6 = any(season_months)))`,
  );
  expect(violations).toEqual([]);

  // "Cambia preferenze" riapre l'onboarding con le risposte salvate.
  await page.getByRole("link", { name: "Cambia preferenze" }).first().click();
  await expect(page).toHaveURL(/\/it\/viaggio\/nuovo$/);
  await expect(page.getByRole("radio", { name: "3 giorni" })).toBeChecked();
  await page.getByRole("button", { name: "Avanti", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mare", exact: true })).toHaveAttribute("aria-pressed", "true");
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
      select u.is_anonymous, c.trip_days,
        (select count(*)::int from public.preference_weights w where w.user_id = u.id and w.explicit > 0) as weights
      from auth.users u join public.user_constraints c on c.user_id = u.id where u.id = ${guestId}`,
  );
  expect(row).toMatchObject({ is_anonymous: false, trip_days: 3, weights: 2 });

  await page.goto("/it/viaggio/proposte");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ecco tre viaggi pensati per te");
});

test("senza risposte la pagina dei viaggi porta all'onboarding", async ({ page }) => {
  await page.goto("/it/viaggio/proposte");
  await expect(page).toHaveURL(/\/it\/viaggio\/nuovo$/);
});
