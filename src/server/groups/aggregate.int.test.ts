import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { getGroupPreferences } from "./aggregate";
import { getGroupProposals } from "./proposals-group";

// Preferenze aggregate del gruppo (passo 4.3) sul database locale. Utenti e gruppi hanno il
// prefisso int- (lo elimina npm run db:clean); nulla dipende dai dati del seed.

const stamp = Date.now();
const owner: DbUser = { id: randomUUID(), email: `int-agg-owner-${stamp}@example.com` };
const bob: DbUser = { id: randomUUID(), email: `int-agg-bob-${stamp}@example.com` };
const carol: DbUser = { id: randomUUID(), email: `int-agg-carol-${stamp}@example.com` };
const dave: DbUser = { id: randomUUID(), email: `int-agg-dave-${stamp}@example.com` };
const outsider: DbUser = { id: randomUUID(), email: `int-agg-outsider-${stamp}@example.com` };
const LOGISTIC_CODES = new Set(["shortVisit", "samePlace", "bestInZone", "noCar", "nearAirport", "stops", "twoAreas"]);
let threeWithPreferencesGroup = "";
let twoMembersGroup = "";

beforeAll(async () => {
  // Il trigger on_auth_user_created crea i profili.
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, raw_user_meta_data)
    values (${owner.id}, ${owner.email}, '{"full_name": "Owner"}'),
           (${bob.id}, ${bob.email}, '{"full_name": "Bob"}'),
           (${carol.id}, ${carol.email}, '{"full_name": "Carol"}'),
           (${dave.id}, ${dave.email}, '{"full_name": "Dave"}'),
           (${outsider.id}, ${outsider.email}, '{"full_name": "Outsider"}')`);

  // Owner, bob e dave hanno completato l'onboarding; carol no.
  await dbAdmin.execute(sql`
    update public.profiles set pace = 'relaxed', onboarding_completed_at = now() where id = ${owner.id}`);
  await dbAdmin.execute(sql`
    update public.profiles set pace = 'balanced', onboarding_completed_at = now() where id = ${bob.id}`);
  await dbAdmin.execute(sql`
    update public.profiles set pace = 'intense', onboarding_completed_at = now() where id = ${dave.id}`);

  await dbAdmin.execute(sql`
    insert into public.preference_weights (user_id, interest_key, explicit) values
      (${owner.id}, 'sea', 5),
      (${bob.id}, 'sea', 1),
      (${carol.id}, 'villages', 5)`);

  await dbAdmin.execute(sql`
    insert into public.user_constraints (user_id, budget_per_day_eur, car_access, reduced_mobility, diet, sensitive_consent_at) values
      (${owner.id}, 90, 'own', false, '{}', null),
      (${bob.id}, 60, 'rental', true, '{vegetarian}', now()),
      (${carol.id}, 40, 'none', false, '{}', null),
      (${dave.id}, 120, 'own', false, '{}', null)`);

  const [three] = await dbAsUser(owner, (tx) =>
    tx.execute<{ id: string }>(sql`select public.create_group('int-agg quattro membri', null) as id`),
  );
  threeWithPreferencesGroup = three!.id;
  const [two] = await dbAsUser(owner, (tx) =>
    tx.execute<{ id: string }>(sql`select public.create_group('int-agg due membri', null) as id`),
  );
  twoMembersGroup = two!.id;

  await dbAdmin.execute(sql`
    insert into public.group_members (group_id, user_id, role) values
      (${threeWithPreferencesGroup}::uuid, ${bob.id}::uuid, 'member'),
      (${threeWithPreferencesGroup}::uuid, ${carol.id}::uuid, 'member'),
      (${threeWithPreferencesGroup}::uuid, ${dave.id}::uuid, 'member'),
      (${twoMembersGroup}::uuid, ${bob.id}::uuid, 'member')`);
});

afterAll(async () => {
  await dbAdmin.execute(
    sql`delete from auth.users where id in (${owner.id}, ${bob.id}, ${carol.id}, ${dave.id}, ${outsider.id})`,
  );
});

describe("preferenze aggregate del gruppo", () => {
  it("con tre membri che hanno completato: pesi con la media, vincoli più restrittivi, nessun dato per persona", async () => {
    const prefs = await getGroupPreferences(owner, threeWithPreferencesGroup);
    expect(prefs.members).toBe(4);
    expect(prefs.withPreferences).toBe(3);
    expect(prefs.private).toBe(false);
    expect(prefs.weights.sea).toBe(2);
    expect(prefs.constraints.car).toBe("none");
    expect(prefs.constraints.budgetPerDayEur).toBe(40);
    expect(prefs.constraints.diets).toEqual(["vegetarian"]);
    expect(prefs.constraints.reducedMobility).toBe(true);
    expect(prefs.constraints.pace).toBe("relaxed");

    const text = JSON.stringify(prefs);
    for (const member of [owner, bob, carol, dave]) expect(text).not.toContain(member.id);
  });

  it("sotto la soglia di tre (due membri con preferenze): nessun peso, nessuna dieta né mobilità ridotta; logistica aggregata", async () => {
    const prefs = await getGroupPreferences(owner, twoMembersGroup);
    expect(prefs.members).toBe(2);
    expect(prefs.withPreferences).toBe(2);
    expect(prefs.private).toBe(true);
    expect(prefs.weights).toEqual({});
    expect(prefs.constraints.reducedMobility).toBe(false);
    expect(prefs.constraints.diets).toEqual([]);
    expect(prefs.constraints.car).toBeNull();
    expect(prefs.constraints.budgetPerDayEur).toBeNull();
    expect(prefs.constraints.pace).toBe("balanced");
  });

  it("chi non è membro non legge le preferenze del gruppo", async () => {
    await expect(getGroupPreferences(outsider, threeWithPreferencesGroup)).rejects.toThrow();
  });
});

describe("proposte di gruppo", () => {
  it("con quattro membri i motivi d'interesse restano: modalità group, tre giorni senza viaggio collegato", async () => {
    const result = await getGroupProposals(owner, threeWithPreferencesGroup);
    expect(result.reasonsMode).toBe("group");
    expect(result.days).toBe(3);
    expect(typeof result.shortened).toBe("boolean");
  });

  it("con due membri solo motivi pratici e niente variante", async () => {
    const result = await getGroupProposals(owner, twoMembersGroup);
    expect(result.reasonsMode).toBe("logistic");
    for (const proposal of result.proposals) {
      expect(proposal.variant).toBeNull();
      for (const reason of proposal.reasons) expect(LOGISTIC_CODES.has(reason.code)).toBe(true);
      for (const day of proposal.days) {
        for (const activity of day.activities) {
          for (const reason of activity.reasons) expect(LOGISTIC_CODES.has(reason.code)).toBe(true);
        }
      }
    }
  });

  it("chi non è membro non vede le proposte del gruppo", async () => {
    await expect(getGroupProposals(outsider, threeWithPreferencesGroup)).rejects.toThrow();
  });
});
