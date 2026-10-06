import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteInactiveGuests } from "@/server/auth/guests.admin";
import {
  clearSensitivePreferences,
  getSavedPreferences,
  saveAnswers,
  saveExtraPreferences,
} from "@/server/personalization/data";
import { dbAdmin } from "./admin";
import { closeConnection } from "./connection";

// Risposte dell'onboarding e preferenze scritte e rilette con dbAsUser (RLS, grant per
// colonna), per un ospite e per un utente: ognuno vede solo le proprie. Mobilità ridotta e
// dieta solo con consenso, cancellabili. La pulizia degli ospiti elimina anche le preferenze.

const guest = { id: randomUUID(), is_anonymous: true };
const other = { id: randomUUID(), email: `int-onboarding-${Date.now()}@example.com`, is_anonymous: false };
const oldGuest = { id: randomUUID(), is_anonymous: true };

const answers = {
  days: 4,
  months: [7, 6, 6],
  interests: ["sea", "food_wine", "art"],
  weights: { sea: 5, food_wine: 2, art: 0 },
  pace: "intense" as const,
  party: "friends" as const,
  airport: "CTA" as const,
  budgetPerDayEur: 80,
  car: "rental" as const,
};

beforeAll(async () => {
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, is_anonymous, created_at, updated_at, last_sign_in_at)
    values (${guest.id}, null, true, now(), now(), now()),
           (${other.id}, ${other.email}, false, now(), now(), now()),
           (${oldGuest.id}, null, true, now() - interval '40 days', now() - interval '40 days', now() - interval '40 days')`);
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from auth.users where id in (${guest.id}, ${other.id}, ${oldGuest.id})`);
  await closeConnection();
});

describe("risposte dell'onboarding", () => {
  it("un ospite salva e rilegge le sue risposte; un interesse scelto a 0 non conta, gli altri valgono 0", async () => {
    await saveAnswers(guest, answers);
    const saved = await getSavedPreferences(guest);
    expect(saved).toMatchObject({
      completed: true,
      days: 4,
      months: [6, 7],
      interests: ["food_wine", "sea"].sort(),
      weights: { sea: 5, food_wine: 2 },
      pace: "intense",
      party: "friends",
      airport: "CTA",
      budgetPerDayEur: 80,
      car: "rental",
    });
    const [zeros] = await dbAdmin.execute<{ n: number }>(
      sql`select count(*)::int as n from public.preference_weights where user_id = ${guest.id} and explicit = 0`,
    );
    expect(zeros!.n).toBeGreaterThan(0);
  });

  it("domande saltate: null, e salvare di nuovo non tocca implicit", async () => {
    await dbAdmin.execute(sql`update public.preference_weights set implicit = 1.5 where user_id = ${guest.id} and interest_key = 'sea'`);
    await saveAnswers(guest, {
      days: null,
      months: [],
      interests: ["sea"],
      weights: { sea: 1 },
      pace: null,
      party: null,
      airport: null,
      budgetPerDayEur: null,
      car: null,
    });
    const saved = await getSavedPreferences(guest);
    expect(saved).toMatchObject({ days: null, months: [], weights: { sea: 1 }, pace: null, airport: null, car: null });
    expect(saved!.implicit.sea).toBe(1.5);
  });

  it("un altro utente non vede le risposte dell'ospite", async () => {
    const saved = await getSavedPreferences(other);
    expect(saved).toMatchObject({ completed: false, interests: [], weights: {} });
  });
});

describe("mobilità ridotta e dieta", () => {
  it("senza consenso non si salvano", async () => {
    await saveExtraPreferences(guest, { reducedMobility: true, diet: ["vegan"], heatTolerance: 2, crowdTolerance: 4, sensitiveConsent: false });
    expect(await getSavedPreferences(guest)).toMatchObject({
      reducedMobility: false,
      diet: [],
      sensitiveConsent: false,
      heatTolerance: 2,
      crowdTolerance: 4,
    });
  });

  it("con consenso si salvano, e si cancellano lasciando il resto", async () => {
    await saveExtraPreferences(guest, { reducedMobility: true, diet: ["vegan", "gluten_free"], heatTolerance: 2, crowdTolerance: 4, sensitiveConsent: true });
    expect(await getSavedPreferences(guest)).toMatchObject({ reducedMobility: true, diet: ["gluten_free", "vegan"], sensitiveConsent: true });
    await clearSensitivePreferences(guest);
    expect(await getSavedPreferences(guest)).toMatchObject({ reducedMobility: false, diet: [], sensitiveConsent: false, heatTolerance: 2 });
  });

  it("il database rifiuta mobilità o dieta senza la data del consenso", async () => {
    await expect(
      dbAdmin.execute(sql`update public.user_constraints set reduced_mobility = true, sensitive_consent_at = null where user_id = ${guest.id}`),
    ).rejects.toThrow();
  });
});

describe("pulizia degli ospiti inattivi", () => {
  it("elimina anche vincoli, pesi e profilo dell'ospite", async () => {
    await saveAnswers(oldGuest, answers);
    await saveExtraPreferences(oldGuest, { reducedMobility: true, diet: [], heatTolerance: 1, crowdTolerance: 1, sensitiveConsent: true });
    // Il salvataggio aggiorna l'utente? No: auth.users resta inattivo da 40 giorni.
    expect(await deleteInactiveGuests()).toBeGreaterThanOrEqual(1);
    const [left] = await dbAdmin.execute<{ constraints: number; weights: number; profiles: number; events: number }>(sql`
      select
        (select count(*)::int from public.user_constraints where user_id = ${oldGuest.id}) as constraints,
        (select count(*)::int from public.preference_weights where user_id = ${oldGuest.id}) as weights,
        (select count(*)::int from public.profiles where id = ${oldGuest.id}) as profiles,
        (select count(*)::int from public.user_events where user_id = ${oldGuest.id}) as events`);
    expect(left).toEqual({ constraints: 0, weights: 0, profiles: 0, events: 0 });
  });
});
