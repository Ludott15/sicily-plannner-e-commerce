import { expect, test } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Admin del catalogo: solo per gli admin; un'attività senza interessi non si attiva;
// l'attivazione compare nel registro admin_audit_log.

test("un utente che non è admin non vede l'admin", async ({ page, request }) => {
  await signUpWithCode(page, request);
  const res = await page.goto("/it/admin/attivita");
  expect(res?.status()).toBe(404);
});

test("admin: crea un'attività, non la attiva senza interessi, la attiva con un interesse", async ({ page, request }) => {
  const email = await signUpWithCode(page, request);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);

  const slug = `e2e-attivita-${Date.now()}`;
  await page.goto("/it/admin/attivita/nuova");
  await page.getByLabel("Titolo").fill("e2e- Attività di prova");
  await page.getByLabel("Slug (indirizzo della pagina)").fill(slug);
  await page.getByLabel("Luogo").selectOption({ label: "Palermo" });
  await page.getByLabel("Durata (minuti)").fill("90");
  await page.getByLabel("Attiva (visibile nel sito)").check();
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "interesse" })).toHaveText(
    "Aggiungi almeno un interesse prima di attivare l'attività.",
  );
  expect((await request.get(`/it/attivita/${slug}`)).status()).toBe(404);

  await page.getByLabel("Mare").selectOption("2");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("status")).toHaveText("Salvato.");
  expect((await request.get(`/it/attivita/${slug}`)).status()).toBe(200);

  const audit = await withDb(
    (sql) => sql`
      select l.action from admin_audit_log l
      join activities a on a.id = l.entity_id
      where a.slug = ${slug}`,
  );
  expect(audit.map((r) => r.action)).toEqual(["activity.activate"]);
});

test("admin: itinerario pronto con titoli dei giorni, una tappa e pubblicazione con slug", async ({ page, request }) => {
  const email = await signUpWithCode(page, request);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);

  const slug = `e2e-itinerario-${Date.now()}`;
  await page.goto("/it/admin/itinerari/nuovo");
  await page.getByLabel("Titolo", { exact: true }).fill("e2e- Itinerario di prova");
  await page.getByLabel("Numero di giorni").fill("2");
  await page.getByLabel("Titolo del giorno 1").fill("Palermo antica");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("status")).toHaveText("Salvato.");

  // Senza slug non è pubblicato.
  const templateUrl = page.url().split("?")[0]!;
  const day1 = page.locator("#giorno-1");
  await day1.getByLabel("Attività").selectOption({ label: "Palazzo dei Normanni e Cappella Palatina" });
  await day1.getByLabel("Orario").fill("10:00");
  await day1.getByRole("button", { name: "Aggiungi tappa" }).click();
  await expect(page.locator("#giorno-1")).toContainText("Palazzo dei Normanni e Cappella Palatina");
  expect((await request.get(`/it/itinerari/${slug}`)).status()).toBe(404);

  await page.goto(templateUrl);
  await page.getByLabel("Slug per la pubblicazione").fill(slug);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("status")).toHaveText("Salvato.");

  await page.goto(`/it/itinerari/${slug}`);
  const days = page.getByRole("navigation", { name: "Giorni" }).getByRole("button");
  await expect(days.nth(0)).toHaveText(/Giorno 1 · Palermo antica/);
  await expect(page.getByRole("link", { name: "Palazzo dei Normanni e Cappella Palatina" })).toBeVisible();
});
