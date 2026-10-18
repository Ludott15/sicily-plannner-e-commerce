import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { sessionUserId, signUpWithCode } from "./helpers";

// Classifiche (passo 5.3). Ogni utente è e2e-…@example.com: la pulizia globale lo elimina.
// Il database si prepara con withDb (import dinamico, vedi e2e/db.mjs).

// Utente registrato con un nome pubblico e punti tali da stare in cima alla stagione corrente.
// award_points accredita una volta sola per (utente, motivo, ref_id); refresh_leaderboard() aggiorna
// la vista materializzata (in produzione lo fa il cron ogni 15 minuti).
const TOP_POINTS = 1_000_000_000;

async function registeredUserOnTop(page: Page, request: APIRequestContext, name: string) {
  await signUpWithCode(page, request);
  const id = await sessionUserId(page);
  const { withDb } = await import("./db.mjs");
  await withDb(async (sql) => {
    await sql`update public.profiles set display_name = ${name} where id = ${id}`;
    await sql`select public.award_points(${id}::uuid, ${TOP_POINTS}::int, 'admin_adjust'::public.point_reason, 'profile', ${randomUUID()}::uuid)`;
    await sql`select public.refresh_leaderboard()`;
  });
  return id;
}

test("la classifica mostra la tabella e la propria posizione", async ({ page, request }) => {
  const name = `e2e-Classifica ${Date.now()}`;
  await registeredUserOnTop(page, request, name);

  await page.goto("/it/classifica");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.locator('tr[aria-current="true"]')).toContainText(name);
  await expect(page.getByRole("region", { name: "La tua posizione" })).toContainText("con 1.000.000.000 punti");
});

test("l'opt-out toglie il nome dalla classifica e lascia la propria posizione", async ({ page, request }) => {
  const name = `e2e-Riservato ${Date.now()}`;
  await registeredUserOnTop(page, request, name);

  await page.goto("/it/profilo");
  await page.getByLabel("Non comparire nella classifica stagionale").check();
  await page.getByRole("button", { name: "Salva la scelta" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Impostazioni salvate." })).toBeVisible();

  await page.goto("/it/classifica");
  await expect(page.locator("td", { hasText: name })).toHaveCount(0);
  const position = page.getByRole("region", { name: "La tua posizione" });
  await expect(position).toContainText("Non compari nella classifica pubblica");
  await expect(position).toContainText("con 1.000.000.000 punti");
});

test("il cron della classifica senza Authorization risponde 401", async ({ request }) => {
  const response = await request.get("/api/cron/refresh-leaderboard");
  expect(response.status()).toBe(401);
});

test("l'admin chiude una stagione e cambia lo stato del premio", async ({ page, request }) => {
  await signUpWithCode(page, request);
  const id = await sessionUserId(page);
  const { withDb } = await import("./db.mjs");
  await withDb(async (sql) => {
    await sql`update public.profiles set role = 'admin' where id = ${id}`;
    await sql`delete from public.season_awards where season = '1990-estate'`;
    await sql`insert into public.season_awards (season, rank, user_id, points, prize_status)
              values ('1990-estate', 1, ${id}::uuid, 1000, 'pending')`;
  });

  // Stagione passata senza premi: la chiusura scatta la foto (anche vuota) e lo dice.
  await page.goto("/it/admin/stagioni?stagione=1991-estate");
  await page.getByRole("button", { name: "Chiudi la stagione" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Stagione chiusa" })).toBeVisible();

  // Stagione con un premio: il suo stato si cambia e resta dopo il ricaricamento.
  await page.goto("/it/admin/stagioni?stagione=1990-estate");
  const row = page.locator('tr[data-rank="1"]');
  await row.getByLabel("Stato del premio").selectOption("shipped");
  await row.getByRole("button", { name: "Salva stato" }).click();
  await expect(row.getByRole("status").filter({ hasText: "Stato del premio aggiornato." })).toBeVisible();

  await page.reload();
  await expect(page.locator('tr[data-rank="1"]').getByLabel("Stato del premio")).toHaveValue("shipped");

  // Stagioni del solo e2e (1990, 1991): non toccano quelle dei test pgTAP.
  await withDb((sql) => sql`delete from public.season_awards where season in ('1990-estate', '1991-estate')`);
});
