import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { EMPTY_ANSWERS, saveAnswers } from "@/server/personalization/data";
import { recordCheckIn } from "./core";

// Punti con il database reale: idempotenza dell'onboarding e del check-in, con dbAsUser
// (RLS e funzioni SQL). Dati con prefisso int- e pulizia a fine suite.

const stamp = Date.now();
const user = { id: randomUUID(), email: `int-punti-${stamp}@example.com`, is_anonymous: false };
const placeId = randomUUID();
const itineraryId = randomUUID();
const itemId = randomUUID();
const checkIn = { itemId, lat: 37.79, lng: 14.83 };

beforeAll(async () => {
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, is_anonymous, created_at, updated_at, last_sign_in_at)
    values (${user.id}, ${user.email}, false, now(), now(), now())
  `);
  await dbAdmin.execute(sql`
    insert into public.places (id, slug, name, province, lat, lng)
    values (${placeId}, ${`int-punti-${stamp}`}, 'int Luogo punti', 'CT', 37.79, 14.83)
  `);
  await dbAdmin.execute(sql`
    insert into public.itineraries (id, owner_id, title, days)
    values (${itineraryId}, ${user.id}, 'int-viaggio punti', 2)
  `);
  await dbAdmin.execute(sql`
    insert into public.itinerary_items (id, itinerary_id, day_index, position, place_id)
    values (${itemId}, ${itineraryId}, 0, 0, ${placeId})
  `);
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from auth.users where id = ${user.id}`);
  await dbAdmin.execute(sql`delete from public.places where id = ${placeId}`);
});

describe("punti con il database", () => {
  it("il profilo completato si accredita una volta sola", async () => {
    const answers = { ...EMPTY_ANSWERS, pace: "balanced" as const };
    await saveAnswers(user, answers);
    await saveAnswers(user, answers);
    const [row] = await dbAdmin.execute<{ n: number }>(
      sql`select count(*)::int as n from public.points_ledger where user_id = ${user.id} and reason = 'profile_completed'`,
    );
    expect(row?.n).toBe(1);
  });

  it("due check-in in parallelo sullo stesso luogo accreditano una sola volta", async () => {
    const results = await Promise.all([recordCheckIn(user, checkIn), recordCheckIn(user, checkIn)]);
    const ok = results.filter((r) => r.status === "ok");
    const failed = results.filter((r) => r.status === "error");
    expect(ok).toHaveLength(1);
    expect(ok[0]).toEqual({ status: "ok", points: 10, itineraryCompleted: false });
    expect(failed).toEqual([{ status: "error", code: "already_checked_in" }]);
    const [row] = await dbAdmin.execute<{ n: number }>(
      sql`select count(*)::int as n from public.points_ledger where user_id = ${user.id} and reason = 'check_in'`,
    );
    expect(row?.n).toBe(1);
  });

  it("la posizione non viene salvata", async () => {
    const [row] = await dbAdmin.execute<{ n: number }>(
      sql`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'check_ins' and column_name in ('lat', 'lng')`,
    );
    expect(row?.n).toBe(0);
  });
});
