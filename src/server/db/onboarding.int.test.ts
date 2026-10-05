import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSavedAnswers, saveAnswers } from "@/server/personalization/data";
import { dbAdmin } from "./admin";
import { closeConnection } from "./connection";

// Risposte dell'onboarding scritte e rilette con dbAsUser (RLS, grant per colonna), per un
// ospite e per un utente: ognuno vede solo le proprie.

const guest = { id: randomUUID(), is_anonymous: true };
const other = { id: randomUUID(), email: `int-onboarding-${Date.now()}@example.com`, is_anonymous: false };

beforeAll(async () => {
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, is_anonymous)
    values (${guest.id}, null, true), (${other.id}, ${other.email}, false)`);
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from auth.users where id in (${guest.id}, ${other.id})`);
  await closeConnection();
});

describe("risposte dell'onboarding", () => {
  it("un ospite salva e rilegge le sue risposte; i pesi non scelti valgono 0", async () => {
    await saveAnswers(guest, {
      days: 4,
      months: [7, 6, 6],
      weights: { sea: 5, food_wine: 2 },
      pace: "intense",
      party: "friends",
      budgetPerDayEur: 80,
      hasCar: true,
    });
    const saved = await getSavedAnswers(guest);
    expect(saved).toMatchObject({
      completed: true,
      days: 4,
      months: [6, 7],
      weights: { sea: 5, food_wine: 2 },
      pace: "intense",
      party: "friends",
      budgetPerDayEur: 80,
      hasCar: true,
    });
    const [zeros] = await dbAdmin.execute<{ n: number }>(
      sql`select count(*)::int as n from public.preference_weights where user_id = ${guest.id} and explicit = 0`,
    );
    expect(zeros!.n).toBeGreaterThan(0);
  });

  it("salvare di nuovo aggiorna, senza toccare implicit", async () => {
    await dbAdmin.execute(sql`update public.preference_weights set implicit = 1.5 where user_id = ${guest.id} and interest_key = 'sea'`);
    await saveAnswers(guest, { days: 2, months: [], weights: { sea: 1 }, pace: "relaxed", party: null, budgetPerDayEur: null, hasCar: false });
    const saved = await getSavedAnswers(guest);
    expect(saved).toMatchObject({ days: 2, months: [], weights: { sea: 1 }, party: null, budgetPerDayEur: null });
    expect(saved!.implicit.sea).toBe(1.5);
  });

  it("un altro utente non vede le risposte dell'ospite", async () => {
    const saved = await getSavedAnswers(other);
    expect(saved).toMatchObject({ completed: false, weights: {} });
  });
});
