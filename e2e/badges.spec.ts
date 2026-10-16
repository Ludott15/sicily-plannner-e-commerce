import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { sessionUserId, signUpWithCode } from "./helpers";

// Badge (passo 5.2). Ogni utente è e2e-…@example.com: la pulizia globale lo elimina.
// Il database si prepara con withDb (import dinamico, vedi e2e/db.mjs).

// Utente registrato con un viaggio completato: award_points è l'unico punto di accredito, e il
// criterio "primo-viaggio" conta le righe itinerary_completed del ledger.
async function registeredUserWithCompletedTrip(page: Page, request: APIRequestContext) {
  await signUpWithCode(page, request);
  const id = await sessionUserId(page);
  const { withDb } = await import("./db.mjs");
  await withDb(async (sql) => {
    const [trip] = await sql`
      insert into public.itineraries (owner_id, title, days) values (${id}, 'e2e- Badge', 1) returning id`;
    await sql`
      select public.award_points(${id}::uuid, 100, 'itinerary_completed'::public.point_reason, 'itinerary', ${trip!.id}::uuid)`;
  });
  return id;
}

test("completare un viaggio assegna Primo viaggio: /punti lo mostra e /notifiche lo annuncia", async ({ page, request }) => {
  await registeredUserWithCompletedTrip(page, request);

  await page.goto("/it/punti");
  await expect(page.getByRole("heading", { name: "I tuoi badge" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Primo viaggio" })).toBeVisible();

  await page.goto("/it/notifiche");
  await expect(page.getByText("Hai ottenuto il badge Primo viaggio.")).toBeVisible();
});

test("l'admin vede /admin/badge con Primo viaggio e il numero di utenti che lo hanno", async ({ page, request }) => {
  const id = await registeredUserWithCompletedTrip(page, request);
  const { withDb } = await import("./db.mjs");
  const holders = await withDb(async (sql) => {
    await sql`update public.profiles set role = 'admin' where id = ${id}`;
    const [row] = await sql`select count(*)::int as n from public.user_badges where badge_key = 'primo-viaggio'`;
    return row!.n as number;
  });

  await page.goto("/it/admin/badge");
  await expect(page.getByRole("heading", { name: "Badge", exact: true })).toBeVisible();
  const row = page.locator("li[data-badge]").filter({ has: page.getByRole("heading", { name: "Primo viaggio", exact: true }) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(
    holders === 1 ? "1 utente ha questo badge" : `${holders} utenti hanno questo badge`,
  );
});
