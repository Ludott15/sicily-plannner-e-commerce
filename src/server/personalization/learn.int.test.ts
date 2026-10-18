import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { IMPLICIT_DECAY, IMPLICIT_DELTAS, IMPLICIT_RANGE, TAG_STRENGTH_MAX } from "./config";
import { activitySimilarity } from "./data";
import { runLearning } from "./learn.admin";

// Apprendimento (M11) sul database locale. Tutto ha il prefisso int- (utenti, luoghi, attività), e
// nulla dipende dai dati del seed. La funzione lavora su tutti gli eventi non processati del
// database: i controlli riguardano solo gli utenti di questo test.

const stamp = Date.now();
const learner: DbUser = { id: randomUUID(), email: `int-learn-a-${stamp}@example.com` };
const idle: DbUser = { id: randomUUID(), email: `int-learn-b-${stamp}@example.com` };

// Due attività con embedding e tag noti (interessi del seed: art, villages, food_wine).
const ACT_A = randomUUID();
const ACT_B = randomUUID();
const TAGS_A = [
  { key: "art", strength: 3 },
  { key: "villages", strength: 2 },
  { key: "food_wine", strength: 1 },
];
const TAGS_B = [
  { key: "art", strength: 3 },
  { key: "villages", strength: 2 },
];

// Variazione attesa per un tipo di evento su un interesse di forza s (come la funzione SQL).
const delta = (type: keyof typeof IMPLICIT_DELTAS, strength: number) =>
  (IMPLICIT_DELTAS[type] * strength) / TAG_STRENGTH_MAX;

const vector = (mod: number) => `[${Array.from({ length: 1024 }, (_, i) => (i % mod) / 10).join(",")}]`;

async function weightsOf(user: DbUser): Promise<Map<string, number>> {
  const rows = await dbAsUser(user, (tx) =>
    tx.execute<{ interest_key: string; implicit: number }>(sql`
      select interest_key, implicit from public.preference_weights where user_id = ${user.id}::uuid`),
  );
  return new Map(rows.map((r) => [r.interest_key, Number(r.implicit)]));
}

beforeAll(async () => {
  await dbAdmin.execute(sql`
    insert into auth.users (id, email) values (${learner.id}, ${learner.email}), (${idle.id}, ${idle.email})`);

  await dbAdmin.execute(sql`
    insert into public.places (id, slug, name, province, lat, lng)
    values (${randomUUID()}, ${"int-learn-" + stamp}, 'Luogo di prova', 'PA', 38.1, 13.4)`);
  const [place] = await dbAdmin.execute<{ id: string }>(sql`select id from public.places where slug = ${"int-learn-" + stamp}`);

  // Attività attive con i loro tag nella stessa transazione: il vincolo sui tag è differito.
  await dbAdmin.transaction(async (tx) => {
    for (const [id, title, tags] of [
      [ACT_A, "int-learn A", TAGS_A],
      [ACT_B, "int-learn B", TAGS_B],
    ] as const) {
      await tx.execute(sql`
        insert into public.activities (id, slug, place_id, title, duration_min, is_active)
        values (${id}, ${"int-learn-" + id}, ${place!.id}::uuid, ${title}, 90, true)`);
      for (const tag of tags) {
        await tx.execute(sql`
          insert into public.activity_interests (activity_id, interest_key, strength)
          values (${id}::uuid, ${tag.key}, ${tag.strength})`);
      }
    }
    await tx.execute(sql`update public.activities set embedding = ${vector(7)}::vector where id = ${ACT_A}::uuid`);
    await tx.execute(sql`update public.activities set embedding = ${vector(5)}::vector where id = ${ACT_B}::uuid`);
  });

  // Il trigger on_auth_user_created crea i profili (già insert in auth.users sopra).
  // Pesi espliciti e un implicit già presente: per il decadimento di idle.
  await dbAdmin.execute(sql`
    insert into public.preference_weights (user_id, interest_key, explicit, implicit) values
      (${idle.id}, 'villages', 3, 1.0)`);

  // Cinque eventi positivi o negativi per learner, un evento per idle.
  await dbAdmin.execute(sql`
    insert into public.user_events (user_id, type, activity_id) values
      (${learner.id}, 'save', ${ACT_A}),
      (${learner.id}, 'add_to_itinerary', ${ACT_A}),
      (${learner.id}, 'vote_up', ${ACT_A}),
      (${learner.id}, 'affiliate_click', ${ACT_A}),
      (${learner.id}, 'remove_from_itinerary', ${ACT_B}),
      (${idle.id}, 'view', ${ACT_A})`);
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from auth.users where id in (${learner.id}::uuid, ${idle.id}::uuid)`);
  await dbAdmin.execute(sql`delete from public.activities where id in (${ACT_A}::uuid, ${ACT_B}::uuid)`);
});

describe("runLearning", () => {
  it("prima esecuzione: pesi nella direzione attesa, nei limiti, eventi processati", async () => {
    const result = await runLearning();
    expect(result.events).toBeGreaterThanOrEqual(6);
    expect(result.users).toBeGreaterThanOrEqual(2);

    const learned = await weightsOf(learner);
    // Interessi di A (positivi) meno quello di B (negativo) sull'art: il saldo è positivo.
    const artSum =
      delta("save", 3) + delta("add_to_itinerary", 3) + delta("vote_up", 3) + delta("affiliate_click", 3) +
      delta("remove_from_itinerary", 3);
    expect(artSum).toBeGreaterThan(0);
    expect(learned.get("art")).toBeCloseTo(artSum, 4);
    // Il villages ha forza 2 in entrambe le attività.
    const villagesSum =
      delta("save", 2) + delta("add_to_itinerary", 2) + delta("vote_up", 2) + delta("affiliate_click", 2) +
      delta("remove_from_itinerary", 2);
    expect(learned.get("villages")).toBeCloseTo(villagesSum, 4);
    // food_wine: solo A, con forza 1 e solo eventi positivi.
    expect(learned.get("food_wine")).toBeCloseTo(
      delta("save", 1) + delta("add_to_itinerary", 1) + delta("vote_up", 1) + delta("affiliate_click", 1),
      4,
    );
    for (const value of learned.values()) {
      expect(value).toBeGreaterThanOrEqual(-IMPLICIT_RANGE);
      expect(value).toBeLessThanOrEqual(IMPLICIT_RANGE);
    }

    const [left] = await dbAdmin.execute<{ n: number }>(sql`
      select count(*)::int as n from public.user_events where user_id = ${learner.id}::uuid and processed_at is null`);
    expect(left?.n).toBe(0);
  });

  it("il decadimento si applica agli utenti con eventi nuovi", async () => {
    const weights = await weightsOf(idle);
    // villages: 1.0 decade del 5%, poi va il view (forza 2).
    expect(weights.get("villages")).toBeCloseTo(1.0 * (1 - IMPLICIT_DECAY) + delta("view", 2), 4);
  });

  it("seconda esecuzione senza eventi nuovi non cambia nulla", async () => {
    const before = await weightsOf(learner);
    const idleBefore = await weightsOf(idle);
    await runLearning();
    expect(await weightsOf(learner)).toEqual(before);
    expect(await weightsOf(idle)).toEqual(idleBefore);
  });

  it("l'embedding del profilo è la media delle attività con interazioni positive", async () => {
    // Solo A ha interazioni positive per learner (B ha solo una rimozione): il profilo è A.
    const [row] = await dbAdmin.execute<{ cos_a: number; cos_b: number }>(sql`
      select 1 - (t.embedding <=> a.embedding) as cos_a, 1 - (t.embedding <=> b.embedding) as cos_b
      from public.user_taste t, public.activities a, public.activities b
      where t.user_id = ${learner.id}::uuid and a.id = ${ACT_A}::uuid and b.id = ${ACT_B}::uuid`);
    expect(Number(row?.cos_a)).toBeCloseTo(1, 4);
    expect(Number(row?.cos_b)).toBeLessThan(0.999);
  });

  it("la similarità è disponibile da 5 eventi, e per learner ha la voce di A", async () => {
    const learnerSimilarity = await activitySimilarity(learner);
    expect(learnerSimilarity?.get(ACT_A)).toBeCloseTo(1, 4);
    // idle ha un solo evento: sotto SIMILARITY_MIN_EVENTS.
    expect(await activitySimilarity(idle)).toBeUndefined();
  });
});
