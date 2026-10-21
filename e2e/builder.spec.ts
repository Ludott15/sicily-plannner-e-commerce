import { chooseOption, pickDate } from "./helpers/controls";
import { expect, test, type Page } from "@playwright/test";
import { sessionUserId, signUpWithCode, testEmail, waitForCode } from "./helpers";

// Itinerary builder (M5): "Usa questo itinerario" e "Salva questo viaggio" creano un viaggio
// dell'utente, anche ospite, con date e persone; pagina del viaggio con giorni, riordino,
// rimozione e checklist "Da prenotare"; "Aggiungi al viaggio" con il giorno compatibile;
// eventi add/remove registrati; un utente non apre né modifica il viaggio di un altro.

const TEMPLATE = "demo-weekend-palermo";

async function useTemplate(page: Page) {
  await page.goto(`/it/itinerari/${TEMPLATE}`);
  await page.getByRole("link", { name: "Usa questo itinerario" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/it/viaggio/salva\\?da=${TEMPLATE}$`));
  await pickDate(page, "Data di partenza", "2027-05-12");
  await chooseOption(page, "Persone", "4 persone");
  const save = page.getByRole("button", { name: "Salva il viaggio" });
  // Senza sessione serve Turnstile (chiavi di prova: si risolve da solo).
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await save.click();
  await expect(page).toHaveURL(/\/it\/viaggi\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test("criterio M5: ospite, usa un itinerario pronto, registrazione con codice, il viaggio resta suo", async ({ page, request }) => {
  const tripId = await useTemplate(page);
  const guestId = await sessionUserId(page);
  // Titoli dei giorni ereditati, date e persone.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Weekend a Palermo e dintorni");
  await expect(page.getByText("Dal 12 maggio 2027 · 4 persone · 3 giorni")).toBeVisible();
  await expect(page.getByRole("button", { name: "Giorno 2 · Monreale e Palermo" })).toBeVisible();

  const { withDb } = await import("./db.mjs");
  const [row] = await withDb(
    (sql) => sql`select i.owner_id, i.travelers, i.start_date::text as start_date, i.day_titles, u.is_anonymous,
      (select count(*)::int from public.itinerary_items ii where ii.itinerary_id = i.id) as items
      from public.itineraries i join auth.users u on u.id = i.owner_id where i.id = ${tripId}`,
  );
  expect(row).toMatchObject({
    owner_id: guestId,
    travelers: 4,
    start_date: "2027-05-12",
    day_titles: ["Palermo", "Monreale e Palermo", "Cefalù"],
    is_anonymous: true,
    items: 7,
  });

  // Registrazione con il codice dal profilo: stesso user id, ora con email.
  const email = testEmail();
  await page.goto("/it/profilo");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Mandami il codice" }).click();
  await page.getByLabel("Codice di 6 cifre").fill(await waitForCode(request, email));
  await page.getByRole("button", { name: "Salva il mio account" }).click();
  await expect(page.getByRole("heading", { name: "Il tuo profilo" })).toBeVisible();
  expect(await sessionUserId(page)).toBe(guestId);

  const [after] = await withDb(
    (sql) => sql`select i.owner_id, u.email, u.is_anonymous from public.itineraries i join auth.users u on u.id = i.owner_id where i.id = ${tripId}`,
  );
  expect(after).toMatchObject({ owner_id: guestId, email, is_anonymous: false });
  await page.goto("/it/viaggi");
  await page.getByRole("link", { name: "Weekend a Palermo e dintorni" }).click();
  await expect(page).toHaveURL(new RegExp(`/it/viaggi/${tripId}$`));
});

test("builder: riordino, rimozione con evento, checklist con il conteggio", async ({ page }) => {
  const tripId = await useTemplate(page);
  const guestId = await sessionUserId(page);
  const db = await import("./db.mjs");
  await db.withDb(
    (sql) => sql`insert into public.user_consents (user_id, kind, granted, text_version) values (${guestId}, 'profiling', true, 'profiling-2026-10-v1')`,
  );
  const stops = page.locator("li.is-stop .is-stop__title");
  await expect(stops).toHaveText(["Street food al mercato di Ballarò", "Palazzo dei Normanni e Cappella Palatina", "Aperitivo e vita notturna alla Vucciria"]);

  await page.getByRole("button", { name: "Azioni per Street food al mercato di Ballarò" }).click();
  await page.getByRole("menuitem", { name: "Sposta giù" }).click();
  await expect(stops).toHaveText(["Palazzo dei Normanni e Cappella Palatina", "Street food al mercato di Ballarò", "Aperitivo e vita notturna alla Vucciria"]);
  await page.getByRole("button", { name: "Azioni per Palazzo dei Normanni e Cappella Palatina" }).click();
  await expect(page.getByRole("menuitem", { name: "Sposta su" })).toBeDisabled();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Azioni per Aperitivo e vita notturna alla Vucciria" }).click();
  await page.getByRole("menuitem", { name: "Togli dal viaggio" }).click();
  await expect(stops).toHaveCount(2);

  // Giorno 3.
  await page.getByRole("button", { name: "Giorno 3 · Cefalù" }).click();
  await expect(stops).toHaveText(["Salita alla Rocca di Cefalù", "Mare e borgo di Cefalù"]);

  const { withDb } = await import("./db.mjs");
  const events = await withDb(
    (sql) => sql`select e.type::text, a.slug from public.user_events e join public.activities a on a.id = e.activity_id
      where e.user_id = ${guestId} and e.itinerary_id = ${tripId}`,
  );
  expect(events).toEqual([{ type: "remove_from_itinerary", slug: "demo-palermo-notte" }]);

  // Checklist: alloggio e voli; nessuna tappa in auto, nessuna offerta nel weekend a Palermo.
  await page.getByRole("tab", { name: "Da prenotare" }).click();
  const list = page.getByRole("region", { name: "Da prenotare" });
  await expect(list.getByText("2 da prenotare · 0 fatti")).toBeVisible();
  await page.getByRole("checkbox", { name: "Segna come prenotato: Alloggio" }).click();
  await expect(list.getByText("1 da prenotare · 1 fatto")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Segna come prenotato: Alloggio" })).toHaveAttribute("aria-checked", "true");
  const [booking] = await withDb(
    (sql) => sql`select status::text, updated_by from public.itinerary_bookings where itinerary_id = ${tripId} and kind = 'lodging'`,
  );
  expect(booking).toMatchObject({ status: "booked", updated_by: guestId });
  // Voli (passo 2.1): il chip porta alla ricerca interna con il viaggio; alloggi e noleggi arrivano con la M6.
  await expect(list.getByRole("link", { name: "Cerca voli" })).toHaveAttribute("href", new RegExp(`/it/voli\\?.*viaggio=${tripId}`));
});

test("Aggiungi al viaggio: giorno compatibile per zona, avviso se il viaggio è lontano, evento registrato", async ({ page }) => {
  const tripId = await useTemplate(page);
  const guestId = await sessionUserId(page);
  const db = await import("./db.mjs");
  await db.withDb(
    (sql) => sql`insert into public.user_consents (user_id, kind, granted, text_version) values (${guestId}, 'profiling', true, 'profiling-2026-10-v1')`,
  );

  // Un'attività di Palermo: proposto il giorno con tappe a Palermo, nessun avviso.
  await page.goto("/it/attivita/demo-teatro-massimo");
  await page.getByRole("link", { name: "Aggiungi al viaggio" }).first().click();
  await expect(page).toHaveURL(/\/it\/viaggi\/aggiungi\?attivita=demo-teatro-massimo$/);
  await expect(page.getByLabel("Giorno")).toHaveText(/^Giorno 1 ·/);
  await expect(page.getByRole("note")).toHaveCount(0);
  await page.getByRole("button", { name: "Aggiungi", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/it/viaggi/${tripId}\\?giorno=1$`));
  await expect(page.locator("li.is-stop .is-stop__title").last()).toHaveText("Visita al Teatro Massimo");

  // Un'attività dell'Etna: avviso del viaggio lontano.
  await page.goto("/it/viaggi/aggiungi?attivita=demo-crateri-etna");
  await expect(page.getByRole("note")).toContainText("Questo viaggio è in un'altra zona");

  const { withDb } = await import("./db.mjs");
  const events = await withDb(
    (sql) => sql`select e.type::text from public.user_events e where e.user_id = ${guestId} and e.itinerary_id = ${tripId}`,
  );
  expect(events).toEqual([{ type: "add_to_itinerary" }]);
});

test("Salva questo viaggio da \"Ecco tre viaggi\": il viaggio proposto diventa un itinerario", async ({ page }) => {
  await page.goto("/it/login");
  await page.getByRole("button", { name: "Continua senza account" }).click();
  await expect(page).toHaveURL(/\/it\/profilo$/);
  const id = await sessionUserId(page);
  const { withDb } = await import("./db.mjs");
  await withDb(async (sql) => {
    await sql`insert into public.user_constraints (user_id, trip_days) values (${id}, 3)`;
    await sql`insert into public.preference_weights (user_id, interest_key, explicit) values (${id}, 'sea', 5)`;
    await sql`update public.profiles set onboarding_completed_at = now() where id = ${id}`;
  });
  await page.goto("/it/viaggio/proposte");
  const first = page.locator("li[data-area]").first();
  const titles = await first.locator("li.is-stop .is-stop__title").allTextContents();
  await first.getByRole("link", { name: "Salva questo viaggio" }).click();
  await expect(page).toHaveURL(/\/it\/viaggio\/salva\?area=/);
  await page.getByRole("button", { name: "Salva il viaggio" }).click();
  await expect(page).toHaveURL(/\/it\/viaggi\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Date da scegliere · 2 persone · 3 giorni")).toBeVisible();
  // Le tappe sono quelle della proposta, giorno per giorno.
  const saved: string[] = [];
  for (let d = 1; d <= 3; d++) {
    await page.getByRole("button", { name: new RegExp(`^Giorno ${d} · `) }).click();
    saved.push(...(await page.locator("li.is-stop .is-stop__title").allTextContents()));
  }
  expect(saved).toEqual(titles);
});

test("un utente non apre né modifica il viaggio di un altro", async ({ page, request, browser }) => {
  const tripId = await useTemplate(page);
  const other = await browser.newPage();
  await signUpWithCode(other, request);
  const res = await other.goto(`/it/viaggi/${tripId}`);
  expect(res?.status()).toBe(404);
  // Né dalla pagina "Aggiungi al viaggio": il viaggio dell'altro non compare tra i suoi.
  await other.goto("/it/viaggi/aggiungi?attivita=demo-teatro-massimo");
  await expect(other.getByText("Non hai ancora un viaggio a cui aggiungerla.")).toBeVisible();
  await other.close();
});
