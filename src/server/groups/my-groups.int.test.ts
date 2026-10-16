import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { groupMembers, groups, itineraries } from "@/server/db/schema";
import type { DbUser } from "@/server/db/user";
import { listMyGroups } from "./queries";

// listMyGroups sul database locale (dbAsUser, RLS). Utenti e dati hanno il prefisso int-
// (lo elimina npm run db:clean); nulla dipende dai dati del seed.

const stamp = Date.now();

function newUser(label: string): DbUser {
  return { id: randomUUID(), email: `int-my-groups-${label}-${stamp}@example.com` };
}

const alice = newUser("alice"); // owner del gruppo principale
const bob = newUser("bob"); // membro del gruppo principale
const carol = newUser("carol"); // estraneo
const dave = newUser("dave"); // ex membro del gruppo principale
const crowdOwner = newUser("crowd-owner");
const crowd = [1, 2, 3, 4, 5].map((n) => newUser(`crowd-${n}`));
const allUsers = [alice, bob, carol, dave, crowdOwner, ...crowd];

const tripId = randomUUID();
let mainGroupId = "";
let secondGroupId = "";
let crowdGroupId = "";

beforeAll(async () => {
  // Il trigger on_auth_user_created crea i profili.
  for (const user of allUsers) {
    await dbAdmin.execute(sql`
      insert into auth.users (id, email, raw_user_meta_data)
      values (${user.id}, ${user.email}, '{"full_name": "Int Tester"}')`);
  }
  await dbAdmin.insert(itineraries).values({ id: tripId, ownerId: alice.id, title: "int-my-groups viaggio", days: 2 });

  // Il trigger groups_add_owner_member inserisce già l'owner tra i membri.
  const [main] = await dbAdmin
    .insert(groups)
    .values({ name: "int-my-groups principale", ownerId: alice.id, itineraryId: tripId })
    .returning({ id: groups.id });
  mainGroupId = main?.id ?? "";
  // Come create_group: il viaggio punta al gruppo (la RLS dei membri passa da itineraries.group_id).
  await dbAdmin.update(itineraries).set({ groupId: mainGroupId }).where(eq(itineraries.id, tripId));
  await dbAdmin.insert(groupMembers).values([
    { groupId: mainGroupId, userId: bob.id, role: "member" },
    { groupId: mainGroupId, userId: dave.id, role: "member" },
  ]);
  await dbAdmin
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, mainGroupId), eq(groupMembers.userId, dave.id)));

  const [second] = await dbAdmin
    .insert(groups)
    .values({ name: "int-my-groups secondo", ownerId: alice.id, itineraryId: null })
    .returning({ id: groups.id });
  secondGroupId = second?.id ?? "";

  const [crowded] = await dbAdmin
    .insert(groups)
    .values({ name: "int-my-groups folla", ownerId: crowdOwner.id, itineraryId: null })
    .returning({ id: groups.id });
  crowdGroupId = crowded?.id ?? "";
  await dbAdmin.insert(groupMembers).values(
    crowd.map((user) => ({ groupId: crowdGroupId, userId: user.id, role: "member" as const })),
  );
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from auth.users where id in (${sql.join(
    allUsers.map((user) => sql`${user.id}`),
    sql`, `,
  )})`);
});

describe("listMyGroups", () => {
  it("l'owner vede il gruppo con ruolo owner, conteggio e viaggio collegato", async () => {
    const groupsOfAlice = await listMyGroups(alice);
    const main = groupsOfAlice.find((group) => group.id === mainGroupId);
    expect(main).toMatchObject({
      name: "int-my-groups principale",
      role: "owner",
      memberCount: 2,
      itineraryId: tripId,
      itineraryTitle: "int-my-groups viaggio",
    });
    expect(main?.members).toHaveLength(2);
  });

  it("dal più recente al più vecchio", async () => {
    const ids = (await listMyGroups(alice)).map((group) => group.id);
    expect(ids.indexOf(secondGroupId)).toBeLessThan(ids.indexOf(mainGroupId));
  });

  it("un membro vede il gruppo con ruolo member e lo stesso viaggio", async () => {
    const main = (await listMyGroups(bob)).find((group) => group.id === mainGroupId);
    expect(main).toMatchObject({
      role: "member",
      memberCount: 2,
      itineraryId: tripId,
      itineraryTitle: "int-my-groups viaggio",
    });
  });

  it("un estraneo non vede nessun gruppo", async () => {
    expect(await listMyGroups(carol)).toEqual([]);
  });

  it("un ex membro non vede più il gruppo", async () => {
    const ids = (await listMyGroups(dave)).map((group) => group.id);
    expect(ids).not.toContain(mainGroupId);
  });

  it("gli avatar sono al massimo quattro, owner per primo", async () => {
    const crowdView = (await listMyGroups(crowdOwner)).find((group) => group.id === crowdGroupId);
    expect(crowdView).toMatchObject({ role: "owner", memberCount: 6, itineraryTitle: null });
    expect(crowdView?.members).toHaveLength(4);

    const asMember = (await listMyGroups(crowd[0] ?? crowdOwner)).find((group) => group.id === crowdGroupId);
    expect(asMember?.role).toBe("member");
    expect(asMember?.members).toHaveLength(4);
  });
});
