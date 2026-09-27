import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "./admin";
import { closeConnection } from "./connection";
import { profiles } from "./schema";
import { dbAsUser } from "./user";

const alice = { id: randomUUID(), email: `alice-${Date.now()}@example.com` };
const bob = { id: randomUUID(), email: `bob-${Date.now()}@example.com` };

beforeAll(async () => {
  // Il trigger on_auth_user_created crea i profili.
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, raw_user_meta_data)
    values (${alice.id}, ${alice.email}, '{"full_name": "Alice"}'),
           (${bob.id}, ${bob.email}, '{"full_name": "Bob"}')
  `);
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from auth.users where id in (${alice.id}, ${bob.id})`);
  await closeConnection();
});

describe("dbAsUser", () => {
  it("imposta ruolo authenticated e auth.uid()", async () => {
    const [row] = await dbAsUser(alice, (tx) =>
      tx.execute<{ role: string; uid: string }>(sql`select current_user as role, auth.uid() as uid`),
    );
    expect(row).toEqual({ role: "authenticated", uid: alice.id });
  });

  it("vede solo il proprio profilo", async () => {
    const rows = await dbAsUser(alice, (tx) =>
      tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(inArray(profiles.id, [alice.id, bob.id])),
    );
    expect(rows).toEqual([{ id: alice.id }]);
  });

  it("non legge il profilo di un altro utente", async () => {
    const rows = await dbAsUser(alice, (tx) =>
      tx.select().from(profiles).where(eq(profiles.id, bob.id)),
    );
    expect(rows).toEqual([]);
  });

  it("non modifica il profilo di un altro utente", async () => {
    const updated = await dbAsUser(alice, (tx) =>
      tx
        .update(profiles)
        .set({ displayName: "hack" })
        .where(eq(profiles.id, bob.id))
        .returning({ id: profiles.id }),
    );
    expect(updated).toEqual([]);

    const [bobProfile] = await dbAdmin
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, bob.id));
    expect(bobProfile?.displayName).toBe("Bob");
  });

  it("non può cambiare il proprio ruolo", async () => {
    await expect(
      dbAsUser(alice, (tx) =>
        tx.update(profiles).set({ role: "admin" }).where(eq(profiles.id, alice.id)),
      ),
    ).rejects.toThrow();
  });

  it("annulla la transazione se fn lancia un errore", async () => {
    await expect(
      dbAsUser(alice, async (tx) => {
        await tx.update(profiles).set({ displayName: "Temp" }).where(eq(profiles.id, alice.id));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const [row] = await dbAdmin
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, alice.id));
    expect(row?.displayName).toBe("Alice");
  });

  it("non lascia ruolo né claim sulla connessione dopo la transazione", async () => {
    await dbAsUser(alice, (tx) => tx.execute(sql`select 1`));

    const [row] = await dbAdmin.execute<{ role: string; claims: string | null }>(
      sql`select current_user as role, nullif(current_setting('request.jwt.claims', true), '') as claims`,
    );
    expect(row).toEqual({ role: "postgres", claims: null });
  });
});
