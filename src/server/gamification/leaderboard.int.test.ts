import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as refreshLeaderboardCron } from "@/app/api/cron/refresh-leaderboard/route";
import { publicNameOf } from "@/lib/seasons";
import { dbAdmin } from "@/server/db/admin";
import { getGroupLeaderboard, getLeaderboardSettings, getSeasonalLeaderboard } from "./leaderboard";
import { setLeaderboardOptOut, setPublicName } from "./leaderboard-actions";

// Classifiche con il database reale (passo 5.3): accrediti (award_points), refresh via cron,
// lettura pubblica e personale, opt-out, nome pubblico e ospiti. Dati con prefisso int- e
// pulizia a fine suite. Il chiamante di requireUser è simulato con l'utente corrente.

const current = vi.hoisted(() => ({ user: { id: "", email: undefined as string | undefined, is_anonymous: false } }));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/server/auth", () => ({
  requireUser: async () => current.user,
}));

const CRON_SECRET = "int-leaderboard-secret";
const stamp = Date.now();
const names = {
  alice: `Int Alice ${stamp}`,
  bob: `Int Bob ${stamp}`,
  carol: `Int Carol ${stamp}`,
};
const alice = { id: randomUUID(), email: `int-lb-alice-${stamp}@example.com`, is_anonymous: false };
const bob = { id: randomUUID(), email: `int-lb-bob-${stamp}@example.com`, is_anonymous: false };
const carol = { id: randomUUID(), email: `int-lb-carol-${stamp}@example.com`, is_anonymous: false };
const guest = { id: randomUUID(), email: undefined, is_anonymous: true };

beforeAll(async () => {
  process.env.CRON_SECRET = CRON_SECRET;
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, is_anonymous, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
    values
      (${alice.id}, ${alice.email}, false, ${JSON.stringify({ full_name: names.alice })}::jsonb, now(), now(), now()),
      (${bob.id}, ${bob.email}, false, ${JSON.stringify({ full_name: names.bob })}::jsonb, now(), now(), now()),
      (${carol.id}, ${carol.email}, false, ${JSON.stringify({ full_name: names.carol })}::jsonb, now(), now(), now()),
      (${guest.id}, null, true, '{}'::jsonb, now(), now(), now())
  `);
  // Punti della stagione corrente: alice 60, bob 90, carol 30 (riscatti esclusi dal totale).
  const awards: Array<[string, number, string]> = [
    [alice.id, 60, "review"],
    [bob.id, 90, "review"],
    [carol.id, 30, "check_in"],
  ];
  for (const [userId, delta, reason] of awards) {
    await dbAdmin.execute(sql`
      select public.award_points(${userId}::uuid, ${delta}::int, ${reason}::public.point_reason, 'int', ${randomUUID()}::uuid)
    `);
  }
  await dbAdmin.execute(sql`
    select public.award_points(${alice.id}::uuid, -20, 'redeem'::public.point_reason, 'order', ${randomUUID()}::uuid)
  `);
});

afterAll(async () => {
  // Cancella gli utenti di test: il ledger segue a cascata (unica eccezione all'immutabilità).
  await dbAdmin.execute(sql`delete from auth.users where id in (${alice.id}, ${bob.id}, ${carol.id}, ${guest.id})`);
});

function rankOf(rows: { publicName: string; rank: number }[], publicName: string): number | undefined {
  return rows.find((row) => row.publicName === publicName)?.rank;
}

describe("classifica stagionale", () => {
  it("il cron senza Authorization risponde 401", async () => {
    const response = await refreshLeaderboardCron(
      new NextRequest("http://localhost/api/cron/refresh-leaderboard"),
    );
    expect(response.status).toBe(401);
  });

  it("il cron con il segreto ricalcola i totali", async () => {
    const response = await refreshLeaderboardCron(
      new NextRequest("http://localhost/api/cron/refresh-leaderboard", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("il visitatore vede la lista con i nomi pubblici, in ordine di punti", async () => {
    const board = await getSeasonalLeaderboard(null);
    const bobRank = rankOf(board.rows, names.bob);
    const aliceRank = rankOf(board.rows, names.alice);
    expect(bobRank).toBeDefined();
    expect(aliceRank).toBeDefined();
    expect(bobRank).toBeLessThan(aliceRank ?? 0);
    expect(board.me).toBeNull();
    for (const row of board.rows) {
      expect(row.publicName).not.toContain("@");
      expect(row.isMe).toBe(false);
    }
  });

  it("l'utente vede la propria posizione e i propri punti senza storico", async () => {
    current.user = alice;
    const board = await getSeasonalLeaderboard(alice);
    expect(board.me?.points).toBe(60);
    expect(board.rows.find((row) => row.isMe)?.publicName).toBe(names.alice);
  });

  it("l'ospite non vede la propria posizione", async () => {
    const board = await getSeasonalLeaderboard(guest);
    expect(board.me).toBeNull();
  });
});

describe("opt-out e nome pubblico", () => {
  it("chi sceglie l'opt-out esce dalla lista ma vede ancora la propria posizione", async () => {
    current.user = bob;
    const result = await setLeaderboardOptOut({ status: "idle" }, { optOut: true });
    expect(result).toEqual({ status: "saved" });

    const board = await getSeasonalLeaderboard(null);
    expect(rankOf(board.rows, names.bob)).toBeUndefined();

    const mine = await getSeasonalLeaderboard(bob);
    expect(mine.me?.points).toBe(90);
    expect(mine.rows.some((row) => row.isMe)).toBe(false);

    const settings = await getLeaderboardSettings(bob);
    expect(settings.optOut).toBe(true);
  });

  it("l'ospite non può cambiare l'opt-out", async () => {
    current.user = guest;
    const result = await setLeaderboardOptOut({ status: "idle" }, { optOut: true });
    expect(result).toEqual({ status: "error", code: "guest_not_allowed" });
  });

  it("il nome pubblico scelto compare al posto delle iniziali, e torna alle iniziali se vuoto", async () => {
    current.user = carol;
    const saved = await setPublicName({ status: "idle" }, { displayName: "  Carolina  " });
    expect(saved).toEqual({ status: "saved" });
    expect((await getLeaderboardSettings(carol)).publicName).toBe("Carolina");

    const cleared = await setPublicName({ status: "saved" }, { displayName: "   " });
    expect(cleared).toEqual({ status: "saved" });
    expect((await getLeaderboardSettings(carol)).publicName).toBe(publicNameOf(null, names.carol));
  });

  it("rifiuta un nome pubblico di oltre 40 caratteri senza scrivere", async () => {
    current.user = carol;
    const result = await setPublicName({ status: "idle" }, { displayName: "x".repeat(41) });
    expect(result).toEqual({ status: "error", code: "invalid" });
  });

  it("l'ospite non può impostare il nome pubblico", async () => {
    current.user = guest;
    const result = await setPublicName({ status: "idle" }, { displayName: "Ospite" });
    expect(result).toEqual({ status: "error", code: "guest_not_allowed" });
  });
});

describe("classifica di gruppo", () => {
  it("un utente che non è membro riceve un errore del database, non i dati del gruppo", async () => {
    await expect(getGroupLeaderboard(carol, randomUUID())).rejects.toThrow();
  });
});
