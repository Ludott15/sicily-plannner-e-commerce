import { expect, test } from "@playwright/test";
import { sessionUserId, signUpWithCode } from "./helpers";

// Viaggio di gruppo in tempo reale (4.2), con due contesti: owner e membro sullo stesso viaggio.
// Il voto del membro arriva all'owner senza ricaricare; lo spostamento dell'owner compare nelle
// modifiche del membro; il membro propone una tappa, l'owner la accetta e il membro vede la notifica.

type Seeded = { tripId: string; activityTitle: string; activitySlug: string };

// Viaggio di 2 giorni con una tappa dal catalogo demo (il seed). Titolo e-2e: la pulizia lo elimina.
async function createTripWithStop(title: string, ownerId: string): Promise<Seeded> {
  const { withDb } = await import("./db.mjs");
  return withDb(async (sql) => {
    const [activity] = await sql`select id, title, slug from public.activities where slug like 'demo-%' order by slug limit 1`;
    const [trip] = await sql`insert into public.itineraries (owner_id, title, days) values (${ownerId}, ${title}, 2) returning id`;
    await sql`insert into public.itinerary_items (itinerary_id, day_index, position, activity_id)
      values (${trip!.id}, 0, 0, ${activity!.id})`;
    return { tripId: trip!.id as string, activityTitle: activity!.title as string, activitySlug: activity!.slug as string };
  });
}

// Il membro entra nel gruppo creato dall'owner (il percorso di invito è coperto da groups.spec.ts).
async function addMember(groupId: string, memberId: string) {
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`insert into public.group_members (group_id, user_id, role) values (${groupId}, ${memberId}, 'member')`);
}

test("voti, modifiche e proposte del gruppo arrivano in tempo reale", async ({ page, request, browser }) => {
  const title = `e2e-tempo-reale-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  await signUpWithCode(page, request);
  const seeded = await createTripWithStop(title, await sessionUserId(page));

  // Owner: crea il gruppo dalla pagina del viaggio. Da mobile il sposta-giorno è un menu visibile.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/it/viaggi/${seeded.tripId}`);
  await page.getByRole("tab", { name: "Gruppo" }).click();
  await page.getByRole("button", { name: "Crea il gruppo" }).click();
  await expect(page).toHaveURL(/\/it\/gruppi\/[0-9a-f-]{36}$/);
  const groupId = new URL(page.url()).pathname.split("/").pop()!;

  await page.goto(`/it/viaggi/${seeded.tripId}`);
  await expect(page.getByRole("button", { name: "Mi piace, 0 voti" })).toBeVisible();

  // Membro: entra nel gruppo e apre lo stesso viaggio.
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signUpWithCode(member, request);
  await addMember(groupId, await sessionUserId(member));
  await member.goto(`/it/viaggi/${seeded.tripId}`);
  // I due tempi si misurano da quando entrambi i canali sono sottoscritti.
  await expect(page.locator('[data-realtime="subscribed"]')).toBeAttached({ timeout: 10_000 });
  await expect(member.locator('[data-realtime="subscribed"]')).toBeAttached({ timeout: 10_000 });

  // Il voto del membro compare all'owner entro 2 secondi, senza ricaricare la pagina.
  await member.getByRole("button", { name: "Mi piace, 0 voti" }).click();
  await expect(member.getByRole("button", { name: "Mi piace, 1 voto" })).toHaveAttribute("aria-pressed", "true");
  // I 2 secondi partono da quando il voto è nel database (il pulsante del membro è ottimistico).
  const { withDb } = await import("./db.mjs");
  await expect
    .poll(async () => {
      const [row] = await withDb((sql) => sql`select count(*)::int as n from public.item_votes where itinerary_id = ${seeded.tripId}`);
      return row!.n;
    })
    .toBe(1);
  await expect(page.getByRole("button", { name: "Mi piace, 1 voto" })).toBeVisible({ timeout: 2000 });

  // L'owner sposta la tappa al giorno 2: il membro lo vede nelle modifiche recenti (scheda Gruppo).
  await member.getByRole("tab", { name: "Gruppo" }).click();
  await page.getByRole("button", { name: /^Azioni per / }).first().click();
  await page.getByRole("menuitem", { name: "Sposta al giorno 2" }).click();
  await expect(member.getByText(/ha spostato .* al giorno 2\./)).toBeVisible({ timeout: 5000 });

  // Il membro propone la tappa dalla scheda dell'attività (scelta del viaggio, poi "Proponi al gruppo").
  await member.goto(`/it/viaggi/aggiungi?attivita=${seeded.activitySlug}`);
  await member.getByRole("button", { name: "Proponi al gruppo" }).click();
  await expect(member.getByText("Proposta inviata.")).toBeVisible();

  // L'owner vede la proposta nella sezione Proposte e la accetta.
  await page.getByRole("tab", { name: "Gruppo" }).click();
  const proposals = page.getByRole("region", { name: "Proposte" });
  const proposal = proposals.getByRole("listitem").filter({ hasText: seeded.activityTitle });
  await expect(proposal).toBeVisible({ timeout: 5000 });
  await proposal.getByRole("button", { name: "Accetta" }).click();
  await expect(proposal).toHaveCount(0);

  // Il membro riceve la notifica dell'accettazione.
  await member.goto("/it/notifiche");
  await expect(member.getByText(/è stata accettata/)).toBeVisible();

  await memberContext.close();
});
