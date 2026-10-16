import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newShareToken, shareTokenHash } from "@/server/crypto/tokens";
import { dbAdmin } from "@/server/db/admin";
import { itineraries } from "@/server/db/schema";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { getGroup, getInvitePage } from "./queries";

// Gruppi con dbAsUser sul database locale. Utenti e dati hanno il prefisso int- (lo elimina
// npm run db:clean); nulla dipende dai dati del seed.

const stamp = Date.now();
const alice: DbUser = { id: randomUUID(), email: `int-groups-alice-${stamp}@example.com` };
const bob: DbUser = { id: randomUUID(), email: `int-groups-bob-${stamp}@example.com` };
const carol: DbUser = { id: randomUUID(), email: `int-groups-carol-${stamp}@example.com` };
const tripId = randomUUID();
const token = newShareToken();
let groupId = "";

beforeAll(async () => {
  // Il trigger on_auth_user_created crea i profili.
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, raw_user_meta_data)
    values (${alice.id}, ${alice.email}, '{"full_name": "Alice"}'),
           (${bob.id}, ${bob.email}, '{"full_name": "Bob"}'),
           (${carol.id}, ${carol.email}, '{"full_name": "Carol"}')`);
  await dbAdmin.insert(itineraries).values({ id: tripId, ownerId: alice.id, title: "int-groups viaggio", days: 2 });
  await dbAdmin.execute(sql`
    insert into public.itinerary_items (itinerary_id, day_index, position, custom_title)
    values (${tripId}, 0, 0, 'int-groups tappa uno'), (${tripId}, 1, 0, 'int-groups tappa due')`);
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from auth.users where id in (${alice.id}, ${bob.id}, ${carol.id})`);
});

describe("gruppi", () => {
  it("l'owner crea il gruppo dal viaggio e il viaggio ne risulta collegato", async () => {
    const [row] = await dbAsUser(alice, (tx) =>
      tx.execute<{ id: string }>(sql`select public.create_group('int-groups', ${tripId}::uuid) as id`),
    );
    groupId = row!.id;
    const view = await getGroup(alice, groupId);
    expect(view?.isOwner).toBe(true);
    expect(view?.itineraryId).toBe(tripId);
    expect(view?.members).toHaveLength(1);
    expect(view?.members[0]?.role).toBe("owner");
  });

  it("il link attivo si vede solo all'owner", async () => {
    await dbAsUser(alice, (tx) =>
      tx.execute(sql`
        insert into public.group_invites (group_id, token_hash, invited_by, max_uses)
        values (${groupId}::uuid, ${shareTokenHash(token)}, ${alice.id}::uuid, 10)`),
    );
    expect((await getGroup(alice, groupId))?.activeLink?.maxUses).toBe(10);
    expect((await getGroup(bob, groupId))).toBeNull();
  });

  it("la pagina pubblica dell'invito mostra l'anteprima senza account", async () => {
    const page = await getInvitePage(token);
    expect(page.status).toBe("active");
    if (page.status === "active") {
      expect(page.preview.groupName).toBe("int-groups");
      expect(page.preview.stops).toEqual(["int-groups tappa uno", "int-groups tappa due"]);
    }
    expect(await getInvitePage("a".repeat(43))).toEqual({ status: "not_found" });
  });

  it("un invitato entra con il link, poi esce; l'uscita dell'owner è rifiutata", async () => {
    const [row] = await dbAsUser(bob, (tx) =>
      tx.execute<{ group_id: string }>(sql`select public.accept_invite(${token}) as group_id`),
    );
    expect(row?.group_id).toBe(groupId);
    expect((await getGroup(bob, groupId))?.members).toHaveLength(2);

    await expect(
      dbAsUser(alice, (tx) => tx.execute(sql`select public.leave_group(${groupId}::uuid)`)),
    ).rejects.toThrow();

    await dbAsUser(bob, (tx) => tx.execute(sql`select public.leave_group(${groupId}::uuid)`));
    expect(await getGroup(bob, groupId)).toBeNull();
  });

  it("l'owner rimuove un membro; un membro non rimuove altri", async () => {
    await dbAsUser(carol, (tx) => tx.execute(sql`select public.accept_invite(${token})`));
    await expect(
      dbAsUser(carol, (tx) => tx.execute(sql`select public.remove_group_member(${groupId}::uuid, ${alice.id}::uuid)`)),
    ).rejects.toThrow();
    await dbAsUser(alice, (tx) =>
      tx.execute(sql`select public.remove_group_member(${groupId}::uuid, ${carol.id}::uuid)`),
    );
    expect((await getGroup(alice, groupId))?.members).toHaveLength(1);
  });

  it("l'invito dopo la revoca non dà più accesso alla pagina", async () => {
    await dbAsUser(alice, (tx) =>
      tx.execute(sql`update public.group_invites set status = 'revoked' where group_id = ${groupId}::uuid and email is null`),
    );
    expect(await getInvitePage(token)).toEqual({ status: "revoked" });
  });
});
