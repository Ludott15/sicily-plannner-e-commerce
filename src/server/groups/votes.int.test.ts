import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTripGroupState } from "./trip-group";
import { dbAdmin } from "@/server/db/admin";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { logItineraryChanges } from "@/server/trips/changes";

// Voti, saldo, registro e stato del viaggio di gruppo sul database locale. Utenti e dati hanno il
// prefisso int- (lo elimina npm run db:clean); nulla dipende dai dati del seed.

const stamp = Date.now();
const owner: DbUser = { id: randomUUID(), email: `int-votes-owner-${stamp}@example.com` };
const member: DbUser = { id: randomUUID(), email: `int-votes-member-${stamp}@example.com` };
const groupTrip = randomUUID();
const soloTrip = randomUUID();
const groupId = randomUUID();
const stopId = randomUUID();
const soloStopId = randomUUID();
const areaId = randomUUID();
const placeId = randomUUID();
const activityId = randomUUID();

beforeAll(async () => {
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, raw_user_meta_data)
    values (${owner.id}, ${owner.email}, '{"full_name": "Owner"}'),
           (${member.id}, ${member.email}, '{"full_name": "Member"}')`);
  await dbAdmin.execute(sql`
    insert into public.areas (id, slug, name_it, name_en)
    values (${areaId}, ${`int-votes-${stamp}`}, 'Area int', 'Int area')`);
  await dbAdmin.execute(sql`
    insert into public.places (id, slug, name, province, area_id, lat, lng)
    values (${placeId}, ${`int-votes-place-${stamp}`}, 'int-votes luogo', 'PA', ${areaId}, 38.11, 13.36)`);
  await dbAdmin.execute(sql`
    insert into public.activities (id, slug, place_id, title, duration_min, is_active)
    values (${activityId}, ${`int-votes-act-${stamp}`}, ${placeId}, 'int-votes attività', 60, false)`);
  await dbAdmin.execute(sql`
    insert into public.itineraries (id, owner_id, title, days)
    values (${groupTrip}, ${owner.id}, 'int-votes gruppo', 1), (${soloTrip}, ${owner.id}, 'int-votes solo', 1)`);
  await dbAdmin.execute(sql`
    insert into public.itinerary_items (id, itinerary_id, day_index, position, activity_id)
    values (${stopId}, ${groupTrip}, 0, 0, ${activityId}), (${soloStopId}, ${soloTrip}, 0, 0, ${activityId})`);
  await dbAdmin.execute(sql`
    insert into public.groups (id, name, owner_id, itinerary_id)
    values (${groupId}, 'int-votes', ${owner.id}, ${groupTrip})`);
  await dbAdmin.execute(sql`
    update public.itineraries set group_id = ${groupId} where id = ${groupTrip}`);
  await dbAdmin.execute(sql`
    insert into public.group_members (group_id, user_id, role)
    values (${groupId}, ${member.id}, 'member')`);
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from auth.users where id in (${owner.id}, ${member.id})`);
  await dbAdmin.execute(sql`delete from public.activities where id = ${activityId}`);
  await dbAdmin.execute(sql`delete from public.places where id = ${placeId}`);
  await dbAdmin.execute(sql`delete from public.areas where id = ${areaId}`);
});

async function vote(user: DbUser, value: 1 | -1 | null): Promise<void> {
  await dbAsUser(user, (tx) =>
    value === null
      ? tx.execute(sql`delete from public.item_votes where itinerary_item_id = ${stopId} and user_id = ${user.id}`)
      : tx.execute(sql`
          insert into public.item_votes (itinerary_item_id, user_id, value)
          values (${stopId}, ${user.id}, ${value})
          on conflict (itinerary_item_id, user_id) do update set value = excluded.value`),
  );
}

describe("voti del viaggio di gruppo", () => {
  it("voto, cambio e annullo; il saldo conta i voti dei membri", async () => {
    await vote(member, 1);
    let state = await getTripGroupState(owner, groupTrip, groupId);
    expect(state.votes[stopId]).toEqual({ up: 1, down: 0, mine: null });

    await vote(member, -1);
    state = await getTripGroupState(member, groupTrip, groupId);
    expect(state.votes[stopId]).toEqual({ up: 0, down: 1, mine: -1 });
    expect(state.members).toBe(2);
    expect(state.isGroupOwner).toBe(false);

    await vote(member, null);
    state = await getTripGroupState(member, groupTrip, groupId);
    expect(state.votes[stopId]).toEqual({ up: 0, down: 0, mine: null });
  });

  it("il voto dell'ex membro non conta nel saldo", async () => {
    await vote(member, 1);
    await dbAdmin.execute(sql`delete from public.group_members where group_id = ${groupId} and user_id = ${member.id}`);
    const [row] = await dbAdmin.execute<{ up_votes: number }>(sql`
      select up_votes from public.item_vote_balances where itinerary_item_id = ${stopId}`);
    expect(row?.up_votes ?? 0).toBe(0);
    await dbAdmin.execute(sql`
      insert into public.group_members (group_id, user_id, role) values (${groupId}, ${member.id}, 'member')`);
  });
});

describe("registro delle modifiche", () => {
  it("scrive solo per i viaggi di gruppo", async () => {
    await dbAsUser(owner, (tx) =>
      logItineraryChanges(tx, {
        itineraryId: soloTrip,
        actorId: owner.id,
        changes: [{ kind: "day_added", payload: { day: 2 } }],
      }),
    );
    await dbAsUser(owner, (tx) =>
      logItineraryChanges(tx, {
        itineraryId: groupTrip,
        actorId: owner.id,
        changes: [{ kind: "day_added", payload: { day: 2 } }],
      }),
    );
    const solo = await dbAdmin.execute<{ n: number }>(sql`
      select count(*)::int as n from public.itinerary_changes where itinerary_id = ${soloTrip}`);
    const group = await getTripGroupState(member, groupTrip, groupId);
    expect(solo[0]?.n).toBe(0);
    expect(group.changes.some((c) => c.kind === "day_added" && c.payload.day === 2)).toBe(true);
  });
});
