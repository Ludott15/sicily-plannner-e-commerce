import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteInactiveGuests } from "@/server/auth/guests.admin";
import { dbAdmin } from "./admin";
import { closeConnection } from "./connection";
import { dbAsUser } from "./user";

// Ospiti dall'app: dbAsUser deve passare is_anonymous nei claim, altrimenti le restrizioni
// delle funzioni SQL non scattano. Pulizia degli ospiti inattivi come la chiama il cron.

const guest = { id: randomUUID(), is_anonymous: true };
const user = { id: randomUUID(), email: `int-guest-user-${Date.now()}@example.com`, is_anonymous: false };
const oldGuest = randomUUID();
const freshGuest = randomUUID();
const ids = [guest.id, user.id, oldGuest, freshGuest];

// Messaggio dell'errore di Postgres, anche quando Drizzle lo avvolge in "Failed query".
async function pgError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const e = error as { message?: string; cause?: { message?: string } };
    return e.cause?.message ?? e.message ?? "";
  }
  return "";
}

beforeAll(async () => {
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, is_anonymous, created_at, updated_at, last_sign_in_at)
    values (${guest.id}, null, true, now(), now(), now()),
           (${user.id}, ${user.email}, false, now(), now(), now()),
           (${oldGuest}, null, true, now() - interval '40 days', now() - interval '40 days', now() - interval '40 days'),
           (${freshGuest}, null, true, now() - interval '5 days', now() - interval '5 days', now() - interval '5 days')
  `);
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from auth.users where id in ${ids}`);
  await closeConnection();
});

describe("ospiti con dbAsUser", () => {
  it("il claim is_anonymous arriva a Postgres", async () => {
    const [row] = await dbAsUser(guest, (tx) =>
      tx.execute<{ anon: string }>(sql`select auth.jwt()->>'is_anonymous' as anon`),
    );
    expect(row?.anon).toBe("true");
  });

  it("un ospite non crea gruppi, un utente sì", async () => {
    expect(await pgError(dbAsUser(guest, (tx) => tx.execute(sql`select public.create_group('int-gruppo')`)))).toContain(
      "guest_not_allowed",
    );

    const [row] = await dbAsUser(user, (tx) =>
      tx.execute<{ id: string }>(sql`select public.create_group('int-gruppo') as id`),
    );
    expect(row?.id).toBeTruthy();
  });

  it("un ospite crea il proprio itinerario", async () => {
    const [row] = await dbAsUser(guest, (tx) =>
      tx.execute<{ id: string }>(
        sql`insert into public.itineraries (owner_id, title, days) values (${guest.id}, 'int-viaggio ospite', 2) returning id`,
      ),
    );
    expect(row?.id).toBeTruthy();
  });
});

describe("pulizia degli ospiti inattivi", () => {
  it("elimina l'ospite inattivo da 40 giorni, lascia quello di 5 giorni e gli utenti", async () => {
    expect(await deleteInactiveGuests()).toBeGreaterThanOrEqual(1);

    const rows = await dbAdmin.execute<{ id: string }>(sql`select id from auth.users where id in ${ids}`);
    const left = rows.map((r) => r.id);
    expect(left).not.toContain(oldGuest);
    expect(left).toEqual(expect.arrayContaining([guest.id, user.id, freshGuest]));
  });
});
