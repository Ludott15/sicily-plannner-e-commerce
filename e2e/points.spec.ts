import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { sessionUserId, signUpWithCode } from "./helpers";

// Punti, check-in e recensioni (passo 5.1). Ogni utente è e2e-…@example.com: la pulizia globale
// lo elimina. Il database si prepara con withDb (import dinamico, vedi e2e/db.mjs).

const ZINGARO = "demo-zingaro";

// Utente registrato con 50 punti di profilo completato (award_points: unico punto di accredito).
async function registeredUserWithPoints(page: Page, request: APIRequestContext) {
  await signUpWithCode(page, request);
  const id = await sessionUserId(page);
  const { withDb } = await import("./db.mjs");
  await withDb(async (sql) => {
    await sql`select public.award_points(${id}::uuid, 50, 'profile_completed'::public.point_reason, 'profile', ${id}::uuid)`;
  });
  return id;
}

// Viaggio dell'utente con due tappe: Zingaro (con luogo) e un'altra attività con luogo.
async function tripWithPlaces(ownerId: string) {
  const { withDb } = await import("./db.mjs");
  return withDb(async (sql) => {
    const [zingaro] = await sql`
      select a.id as "activityId", a.place_id as "placeId", p.lat, p.lng
      from public.activities a join public.places p on p.id = a.place_id
      where a.slug = ${ZINGARO}`;
    const [other] = await sql`
      select a.id as "activityId", a.place_id as "placeId"
      from public.activities a
      where a.slug <> ${ZINGARO} and a.slug like 'demo-%' and a.is_active
        and a.place_id is not null and a.place_id <> ${zingaro!.placeId}
      order by a.slug
      limit 1`;
    const [trip] = await sql`insert into public.itineraries (owner_id, title, days) values (${ownerId}, 'e2e- Punti', 1) returning id`;
    await sql`
      insert into public.itinerary_items (itinerary_id, day_index, position, activity_id, place_id)
      values (${trip!.id}, 0, 0, ${zingaro!.activityId}, ${zingaro!.placeId}),
             (${trip!.id}, 0, 1, ${other!.activityId}, ${other!.placeId})`;
    return { tripId: trip!.id as string, lat: zingaro!.lat as number, lng: zingaro!.lng as number };
  });
}

test("la home mostra i punti e porta a /punti con saldo e regole", async ({ page, request }) => {
  await registeredUserWithPoints(page, request);
  await page.goto("/it");
  await page.getByRole("link", { name: "Vedi i tuoi punti" }).click();
  await expect(page).toHaveURL(/\/it\/punti$/);
  await expect(page.getByRole("heading", { name: "I miei punti" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Come si guadagnano" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Come si guadagnano" }).getByText("Profilo completato")).toBeVisible();
});

test("il regolamento dei punti si apre dal link in /punti", async ({ page, request }) => {
  await registeredUserWithPoints(page, request);
  await page.goto("/it/punti");
  await page.getByRole("link", { name: "Regolamento dei punti" }).click();
  await expect(page).toHaveURL(/\/it\/punti\/regolamento$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Regolamento dei punti");
});

test("recensione da 80 caratteri: etichetta Recensione con premio", async ({ page, request }) => {
  const id = await registeredUserWithPoints(page, request);
  await tripWithPlaces(id);
  await page.goto(`/it/attivita/${ZINGARO}`);
  await expect(page.getByRole("heading", { name: "Scrivi una recensione" })).toBeVisible();
  await page.getByLabel("4 su 5").check();
  const body = `Sentiero costiero con calette che cambiano colore ogni ora. Siamo partiti presto e il caldo non si sentiva. ${Date.now()}`;
  await page.getByLabel("La tua recensione").fill(body);
  await page.getByRole("button", { name: "Pubblica recensione" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Recensione salvata" })).toContainText("Recensione salvata: hai guadagnato 20 punti.");
  await expect(page.getByText("Recensione con premio")).toBeVisible();
});

test("check-in vicino al luogo: +10 punti; lontano: messaggio di distanza", async ({ page, request, context }) => {
  const id = await registeredUserWithPoints(page, request);
  const { tripId, lat, lng } = await tripWithPlaces(id);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: lat, longitude: lng });

  await page.goto(`/it/viaggi/${tripId}`);
  await page.getByRole("button", { name: "Sono qui" }).first().click();
  await page.getByRole("button", { name: "Consenti e verifica" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Check-in fatto" })).toContainText("Check-in fatto: +10 punti.");

  // La prima tappa è segnata e la pagina ha finito di aggiornarsi (router.refresh): solo allora
  // il primo "Sono qui" rimasto è quello della seconda tappa.
  await expect(page.getByText("Check-in fatto oggi")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Non networkidle: la mappa del viaggio scarica tasselli di continuo. Dopo l'aggiornamento resta
  // un solo "Sono qui", quello della seconda tappa.
  await expect(page.getByRole("button", { name: "Sono qui", exact: true })).toHaveCount(1);

  // Seconda tappa, con la posizione in mezzo all'oceano: il server risponde too_far.
  await context.setGeolocation({ latitude: 0, longitude: 0 });
  await page.getByRole("button", { name: "Sono qui", exact: true }).first().click();
  await page.getByRole("button", { name: "Consenti e verifica" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "troppo lontano" })).toContainText("Sei troppo lontano dal luogo.");
});

test("l'admin nasconde una recensione segnalata e sparisce dalla pagina dell'attività", async ({ page, request }) => {
  const id = await registeredUserWithPoints(page, request);
  const body = `Recensione da moderare ${Date.now()}: il sentiero è lungo e le indicazioni sono chiare, da fare al mattino.`;
  const { withDb } = await import("./db.mjs");
  await withDb(async (sql) => {
    const [activity] = await sql`select id from public.activities where slug = ${ZINGARO}`;
    const [review] = await sql`
      insert into public.reviews (user_id, activity_id, rating, body)
      values (${id}, ${activity!.id}, 3, ${body})
      returning id`;
    await sql`insert into public.review_reports (review_id, reporter_id, reason) values (${review!.id}, ${id}, 'spam')`;
    await sql`update public.profiles set role = 'admin' where id = ${id}`;
  });

  await page.goto("/it/admin/recensioni");
  await expect(page.getByRole("heading", { name: "Recensioni segnalate" })).toBeVisible();
  await expect(page.getByText(body)).toBeVisible();
  const row = page.locator("article", { hasText: body });
  await row.getByRole("button", { name: "Nascondi" }).click();
  await expect(row.getByRole("button", { name: "Ripristina" })).toBeVisible();

  await page.goto(`/it/attivita/${ZINGARO}`);
  await expect(page.getByText(body)).toHaveCount(0);
});
