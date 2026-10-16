import { expect, test } from "@playwright/test";
import { sessionUserId, signUpWithCode } from "./helpers";

// Gruppi, passo 4.3: la pagina del gruppo mostra gli interessi comuni (solo chiavi e livello, mai
// i nomi dei membri) e tre viaggi per il gruppo. Con un solo membro (meno di 3) i motivi sono solo
// pratici e una nota lo dice. Dati e-2e (titolo e nome): la pulizia li elimina.

test("gruppo: interessi comuni senza nomi, tre viaggi per il gruppo e nota dei motivi pratici", async ({ page, request }) => {
  const title = `e2e-proposte-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const displayName = `e2e Persona ${Math.floor(Math.random() * 1e4)}`;
  await signUpWithCode(page, request);
  const ownerId = await sessionUserId(page);

  // Gusti e auto come nel seed dei viaggi (cibo e vino, auto a noleggio), cinque giorni: le aree
  // del seed li coprono. Il profilo è completo, quindi il percorso dei gusti non torna.
  const { withDb } = await import("./db.mjs");
  const [trip] = await withDb(async (sql) => {
    await sql`update public.profiles set display_name = ${displayName}, onboarding_completed_at = now() where id = ${ownerId}`;
    await sql`insert into public.user_constraints (user_id, car_access, trip_days) values (${ownerId}, 'rental', 5)`;
    await sql`insert into public.preference_weights (user_id, interest_key, explicit) values (${ownerId}, 'food_wine', 5)`;
    return sql`insert into public.itineraries (owner_id, title, days) values (${ownerId}, ${title}, 5) returning id`;
  });

  await page.goto(`/it/viaggi/${trip!.id}`);
  await page.getByRole("tab", { name: "Gruppo" }).click();
  await page.getByRole("button", { name: "Crea il gruppo" }).click();
  await expect(page).toHaveURL(/\/it\/gruppi\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  // Interessi comuni: con un solo membro (sotto i 3 che hanno indicato i gusti) non si mostra
  // nessun interesse, né il suo nome: compare lo stato "privato".
  const interests = page.getByRole("region", { name: "Interessi comuni" });
  await expect(interests.getByText("Gli interessi comuni compaiono quando almeno 3 persone")).toBeVisible();
  await expect(interests.getByText("Cibo e vino")).toHaveCount(0);
  await expect(interests.getByText("Molto in comune")).toHaveCount(0);
  await expect(interests).not.toContainText(displayName);

  // Tre viaggi per il gruppo, nella scheda "Viaggi proposti", con la nota dei motivi pratici (un solo membro).
  await page.getByRole("tab", { name: "Viaggi proposti" }).click();
  await expect(page).toHaveURL(/scheda=viaggi/);
  const proposals = page.getByRole("region", { name: "Ecco tre viaggi per il gruppo" });
  await expect(proposals).toBeVisible();
  await expect(proposals.getByRole("note").filter({ hasText: "Con meno di 3 persone mostriamo solo motivi pratici" })).toBeVisible();
  await expect(proposals.locator("li[data-area]").first()).toBeVisible();
  await expect(proposals).not.toContainText(displayName);
  // Il gruppo non salva le proposte in questo passo: nessun "Salva questo viaggio" qui.
  await expect(proposals.getByRole("link", { name: "Salva questo viaggio" })).toHaveCount(0);
});
