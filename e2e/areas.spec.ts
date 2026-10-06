import { expect, test, type Page } from "@playwright/test";
import { sessionUserId, signUpWithCode } from "./helpers";

// Proposte per aree (M4 parte 3) con il seed demo: tre viaggi in tre aree diverse, ognuno con
// il perché della zona; la riga "Indicativo" sotto le tappe ammesse dal filtro della dieta;
// la copertura del catalogo nell'admin.

async function guestWithAnswers(page: Page, extra?: { diet: string[] }) {
  await page.goto("/it/login");
  await page.getByRole("button", { name: "Continua senza account" }).click();
  await expect(page).toHaveURL(/\/it\/profilo$/);
  const id = await sessionUserId(page);
  const { withDb } = await import("./db.mjs");
  await withDb(async (sql) => {
    if (extra) {
      await sql`insert into public.user_constraints (user_id, trip_days, diet, sensitive_consent_at)
        values (${id}, 3, ${extra.diet}, now())`;
    } else {
      await sql`insert into public.user_constraints (user_id, trip_days) values (${id}, 3)`;
    }
    await sql`insert into public.preference_weights (user_id, interest_key, explicit) values (${id}, 'food_wine', 5)`;
    await sql`update public.profiles set onboarding_completed_at = now() where id = ${id}`;
  });
}

test("tre viaggi in tre aree diverse, con il perché della zona e il link alle Preferenze", async ({ page }) => {
  await guestWithAnswers(page);
  await page.goto("/it/viaggio/proposte");
  const proposals = page.locator("li[data-area]");
  await expect(proposals).toHaveCount(3);
  const areas = await proposals.evaluateAll((els) => els.map((el) => el.getAttribute("data-area")));
  expect(new Set(areas).size).toBe(3);
  await expect(page.getByRole("heading", { name: "Perché questa zona" })).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 2, name: /^Viaggio 1 · / })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Preferenze", exact: true })).toHaveAttribute("href", "/it/preferenze");
  await expect(page.getByRole("banner").getByRole("link", { name: "Preferenze", exact: true })).toBeVisible();
  // Senza dieta nessuna riga "Indicativo".
  await expect(page.getByText("Indicativo: conferma sempre con chi organizza")).toHaveCount(0);
});

test("dieta: le tappe di cibo ammesse dal filtro portano la riga \"Indicativo\"", async ({ page }) => {
  await guestWithAnswers(page, { diet: ["vegetarian"] });
  await page.goto("/it/viaggio/proposte");
  await expect(page.getByText("Indicativo: conferma sempre con chi organizza").first()).toBeVisible();
});

test("admin: copertura del catalogo per area con l'idoneità per 3, 5 e 7 giorni", async ({ page, request }) => {
  const email = await signUpWithCode(page, request);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);
  await page.goto("/it/admin/copertura");
  await expect(page.getByRole("heading", { name: "Copertura del catalogo" })).toBeVisible();
  // Seed demo: l'Etna ha 8 attività ed è idonea per 3 giorni; l'Interno ne ha una sola e non lo è.
  await expect(page.locator('tr[data-area="etna-costa-ionica"] td[data-days="3"]')).toHaveText("Idonea");
  await expect(page.locator('tr[data-area="interno"] td[data-days="3"]')).toHaveText("Non idonea");
  await expect(page.locator("tr[data-area]")).toHaveCount(9);
});
