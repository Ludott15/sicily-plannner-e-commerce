import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { setConsent } from "./consents";
import { buildAccountExport, pointsCsv } from "./export";
import { userQuotaAllowed } from "./quota";

// Passo 8.2 sul database locale. Tutto ha il prefisso int- (utenti ed email), nulla dipende dal seed.
// La cancellazione passa dalla stessa funzione di eraseAccount (delete_my_account, con dbAsUser);
// la sessione Supabase non serve nei test.

const stamp = Date.now();
const owner: DbUser = { id: randomUUID(), email: `int-82-owner-${stamp}@example.com` };
const member: DbUser = { id: randomUUID(), email: `int-82-member-${stamp}@example.com` };
const other: DbUser = { id: randomUUID(), email: `int-82-other-${stamp}@example.com` };

const PLACE = randomUUID();
const ACTIVITY = randomUUID();
const TRIP = randomUUID();
const GROUP = randomUUID();
const SOLO_TRIP = randomUUID();
const BADGE_KEY = `int-82-badge-${stamp}`;
const CHECKOUT = randomUUID();
const CHECKOUT_TOKEN_HASH = "a".repeat(64);
// Sessione del membro (non cancellato dal test): per l'export, che gira dopo la cancellazione del proprietario.
const MEMBER_CHECKOUT = randomUUID();
const MEMBER_TOKEN_HASH = "b".repeat(64);

// Conteggio delle righe dell'utente in una tabella: ruolo postgres, nessun filtro RLS.
async function countWhere(table: string, column: string, userId: string): Promise<number> {
  const [row] = await dbAdmin.execute<{ n: number }>(
    sql`select count(*)::int as n from ${sql.raw(table)} where ${sql.raw(column)} = ${userId}::uuid`,
  );
  return Number(row?.n ?? 0);
}

beforeAll(async () => {
  await dbAdmin.execute(sql`
    insert into auth.users (id, email) values
      (${owner.id}, ${owner.email}), (${member.id}, ${member.email}), (${other.id}, ${other.email})`);

  await dbAdmin.execute(sql`
    insert into public.places (id, slug, name, province, lat, lng)
    values (${PLACE}, ${"int-82-" + stamp}, 'Luogo int-82', 'CT', 37.79, 14.83)`);
  // Un'attività attiva deve avere tag, nella stessa transazione (vincolo differito, come in learn.int.test.ts).
  await dbAdmin.transaction(async (tx) => {
    await tx.execute(sql`
      insert into public.activities (id, slug, place_id, title, duration_min, is_active)
      values (${ACTIVITY}, ${"int-82-act-" + stamp}, ${PLACE}, 'Attività int-82', 60, true)`);
    await tx.execute(sql`
      insert into public.activity_interests (activity_id, interest_key, strength)
      values (${ACTIVITY}, 'art', 2)`);
  });

  await dbAdmin.execute(sql`
    insert into public.itineraries (id, owner_id, title, days) values
      (${TRIP}, ${owner.id}, 'int-82 viaggio di gruppo', 2),
      (${SOLO_TRIP}, ${owner.id}, 'int-82 viaggio solo', 1)`);
  await dbAdmin.execute(sql`
    insert into public.itinerary_items (id, itinerary_id, day_index, position, activity_id)
    values (${randomUUID()}, ${TRIP}, 0, 0, ${ACTIVITY})`);
  await dbAdmin.execute(sql`
    insert into public.groups (id, name, owner_id, itinerary_id)
    values (${GROUP}, 'int-82 gruppo', ${owner.id}, ${TRIP})`);
  await dbAdmin.execute(sql`update public.itineraries set group_id = ${GROUP} where id = ${TRIP}`);
  await dbAdmin.execute(sql`
    insert into public.group_members (group_id, user_id, role, joined_at) values
      (${GROUP}, ${member.id}, 'member', '2020-01-01 00:00+00'),
      (${GROUP}, ${other.id}, 'member', '2021-01-01 00:00+00')`);

  await dbAdmin.execute(sql`
    insert into public.badges (key, name_it, name_en, criteria)
    values (${BADGE_KEY}, 'int-82', 'int-82', '{"type":"points_total","min":100000}'::jsonb)`);
  await dbAdmin.execute(sql`
    insert into public.user_badges (user_id, badge_key) values (${owner.id}, ${BADGE_KEY})`);
  await dbAdmin.execute(sql`
    insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, season)
    values (${owner.id}, 5, 'review', 'activity', ${ACTIVITY}, '2026-estate')`);
  await dbAdmin.execute(sql`
    insert into public.check_ins (user_id, place_id, itinerary_id) values (${owner.id}, ${PLACE}, ${TRIP})`);
  await dbAdmin.execute(sql`
    insert into public.reviews (user_id, activity_id, rating, body)
    values (${owner.id}, ${ACTIVITY}, 4, 'int-82 recensione')`);
  await dbAdmin.execute(sql`
    insert into public.chat_sessions (user_id, title) values (${owner.id}, 'int-82 chat'), (${other.id}, 'int-82 chat altro')`);
  await dbAdmin.execute(sql`
    insert into public.notifications (user_id, kind) values (${owner.id}, 'badge_earned')`);
  await dbAdmin.execute(sql`
    insert into public.user_constraints (user_id, reduced_mobility, diet, sensitive_consent_at)
    values (${owner.id}, true, '{vegan}', now())`);
  await dbAdmin.execute(sql`
    insert into public.user_taste (user_id) values (${owner.id})`);
  await dbAdmin.execute(sql`
    insert into public.preference_weights (user_id, interest_key, explicit, implicit) values (${owner.id}, 'art', 3, 0.5)`);
  await dbAdmin.execute(sql`
    insert into public.item_votes (itinerary_item_id, itinerary_id, user_id, value)
    select i.id, i.itinerary_id, ${owner.id}, 1 from public.itinerary_items i where i.itinerary_id = ${TRIP} limit 1`);
  await dbAdmin.execute(sql`
    insert into public.affiliate_clicks (user_id, partner, target_url, subid, context)
    values (${owner.id}, 'viator', 'https://www.viator.com/int-82', ${"int82sub" + stamp}, 'page')`);
  await dbAdmin.execute(sql`
    insert into public.orders (user_id, email, subtotal_cents, total_cents, stripe_session_id)
    values (${owner.id}, ${owner.email}, 1000, 1000, ${"cs_int_82_" + stamp})`);
  await dbAdmin.execute(sql`
    insert into public.checkout_sessions (id, user_id, cart, subtotal_cents, shipping_cents, discount_cents, points_redeemed, status, expires_at, token_hash)
    values (${CHECKOUT}, ${owner.id},
      ${JSON.stringify([{ productId: ACTIVITY, title: "int-82 prodotto", quantity: 1, unitPriceCents: 1000, vatRate: 10, otherUserEmail: "altro@example.com" }])}::jsonb,
      1000, 0, 0, 0, 'open', now() + interval '31 minutes', ${CHECKOUT_TOKEN_HASH})`);
  await dbAdmin.execute(sql`
    insert into public.checkout_sessions (id, user_id, cart, subtotal_cents, shipping_cents, discount_cents, points_redeemed, status, expires_at, token_hash)
    values (${MEMBER_CHECKOUT}, ${member.id},
      ${JSON.stringify([{ productId: ACTIVITY, title: "int-82 prodotto membro", quantity: 2, unitPriceCents: 500, vatRate: 4, otherUserEmail: "altro@example.com" }])}::jsonb,
      1000, 690, 0, 0, 'expired', now() + interval '31 minutes', ${MEMBER_TOKEN_HASH})`);
  await dbAdmin.execute(sql`
    insert into public.admin_audit_log (actor_id, action, entity)
    values (${owner.id}, ${"int82_adjust_" + stamp}, 'points')`);
  await setConsent(owner, "profiling", true);
  await setConsent(owner, "sensitive", true);
  await dbAdmin.execute(sql`
    insert into public.user_events (user_id, type, activity_id) values (${owner.id}, 'view', ${ACTIVITY})`);
});

afterAll(async () => {
  // Gli utenti del test sono già eliminati dal test; la pulizia residua la fa db:clean (prefisso int-).
  await dbAdmin.execute(sql`delete from public.badges where key = ${BADGE_KEY}`);
});

describe("eliminazione dell'account, tabella per tabella", () => {
  it("prima: il proprietario ha righe in ogni tabella con user_id", async () => {
    const tables: [string, string][] = [
      ["public.profiles", "id"],
      ["public.user_consents", "user_id"],
      ["public.user_constraints", "user_id"],
      ["public.preference_weights", "user_id"],
      ["public.user_taste", "user_id"],
      ["public.user_events", "user_id"],
      ["public.notifications", "user_id"],
      ["public.points_ledger", "user_id"],
      ["public.user_badges", "user_id"],
      ["public.check_ins", "user_id"],
      ["public.chat_sessions", "user_id"],
      ["public.itineraries", "owner_id"],
      ["public.groups", "owner_id"],
      ["public.item_votes", "user_id"],
      ["public.reviews", "user_id"],
      ["public.affiliate_clicks", "user_id"],
      ["public.orders", "user_id"],
      ["public.checkout_sessions", "user_id"],
    ];
    for (const [table, column] of tables) {
      expect(await countWhere(table, column, owner.id), table).toBeGreaterThan(0);
    }
    expect(await countWhere("public.admin_audit_log", "actor_id", owner.id)).toBeGreaterThan(0);
  });

  it("cancellazione: sparisce tutto ciò che è dell'utente, con le eccezioni del contratto", async () => {
    await dbAsUser(owner, (tx) => tx.execute(sql`select public.delete_my_account()`));

    for (const [table, column] of [
      ["public.profiles", "id"],
      ["public.user_consents", "user_id"],
      ["public.user_constraints", "user_id"],
      ["public.preference_weights", "user_id"],
      ["public.user_taste", "user_id"],
      ["public.user_events", "user_id"],
      ["public.notifications", "user_id"],
      ["public.points_ledger", "user_id"],
      ["public.user_badges", "user_id"],
      ["public.check_ins", "user_id"],
      ["public.chat_sessions", "user_id"],
      ["public.item_votes", "user_id"],
      ["public.itineraries", "owner_id"],
      ["public.groups", "owner_id"],
    ] as const) {
      expect(await countWhere(table, column, owner.id), table).toBe(0);
    }
  });

  it("le eccezioni: ordini e registro admin restano con user null, la recensione senza autore", async () => {
    const [order] = await dbAdmin.execute<{ n: number }>(sql`
      select count(*)::int as n from public.orders where stripe_session_id like ${"cs_int_82_" + stamp} and user_id is null`);
    expect(Number(order?.n)).toBe(1);

    const [audit] = await dbAdmin.execute<{ n: number }>(sql`
      select count(*)::int as n from public.admin_audit_log where action = ${"int82_adjust_" + stamp} and actor_id is null`);
    expect(Number(audit?.n)).toBe(1);

    const [click] = await dbAdmin.execute<{ n: number }>(sql`
      select count(*)::int as n from public.affiliate_clicks where subid = ${"int82sub" + stamp} and user_id is null`);
    expect(Number(click?.n)).toBe(1);

    const [checkout] = await dbAdmin.execute<{ n: number }>(sql`
      select count(*)::int as n from public.checkout_sessions where id = ${CHECKOUT} and user_id is null`);
    expect(Number(checkout?.n)).toBe(1);

    const [review] = await dbAdmin.execute<{ n: number }>(sql`
      select count(*)::int as n from public.reviews where body = 'int-82 recensione' and user_id is null`);
    expect(Number(review?.n)).toBe(1);
  });

  it("gruppo: il membro più vecchio diventa proprietario, il viaggio segue il gruppo", async () => {
    const [group] = await dbAdmin.execute<{ owner_id: string }>(sql`select owner_id from public.groups where id = ${GROUP}`);
    expect(group?.owner_id).toBe(member.id);
    const [trip] = await dbAdmin.execute<{ owner_id: string }>(sql`select owner_id from public.itineraries where id = ${TRIP}`);
    expect(trip?.owner_id).toBe(member.id);
    expect(await countWhere("public.itineraries", "id", SOLO_TRIP)).toBe(0);
  });

  it("altri utenti: le loro righe restano", async () => {
    expect(await countWhere("public.chat_sessions", "user_id", other.id)).toBe(1);
    expect(await countWhere("public.group_members", "user_id", member.id)).toBeGreaterThan(0);
  });
});

describe("export: solo i dati dell'utente", () => {
  it("non include i dati degli altri membri del gruppo", async () => {
    await dbAdmin.execute(sql`
      insert into public.item_votes (itinerary_item_id, itinerary_id, user_id, value)
      select i.id, i.itinerary_id, ${other.id}, -1 from public.itinerary_items i where i.itinerary_id = ${TRIP} limit 1`);

    const data = await buildAccountExport(member);
    expect(data.profile?.email).toBe(member.email);
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain(other.id);
    expect(data.votes.every((vote) => vote.userId === member.id)).toBe(true);
    expect(data.groups.map((group) => group.groupId)).toContain(GROUP);
  });

  it("include le sessioni di checkout: stato, importi, punti e righe del carrello, senza hash del token né altri dati", async () => {
    const data = await buildAccountExport(member);
    expect(data.checkouts).toHaveLength(1);
    const [checkout] = data.checkouts;
    expect(checkout?.status).toBe("expired");
    expect(checkout?.subtotalCents).toBe(1000);
    expect(checkout?.shippingCents).toBe(690);
    expect(checkout?.lines).toEqual([
      { productId: ACTIVITY, title: "int-82 prodotto membro", quantity: 2, unitPriceCents: 500, vatRate: 4 },
    ]);
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain(MEMBER_TOKEN_HASH);
    expect(serialized).not.toContain("otherUserEmail");
  });

  it("CSV dei punti: solo le righe del ledger", () => {
    const csv = pointsCsv([{ createdAt: new Date("2026-10-01T10:00:00Z"), reason: "review", delta: 5, season: "2026-estate" }]);
    expect(csv.split("\r\n")[0]).toBe('"data","motivo","punti","stagione"');
    expect(csv).toContain('"review","5","2026-estate"');
  });
});

describe("profilazione condizionata al consenso", () => {
  it("senza consenso un evento non viene scritto (prova a rovescio: con consenso sì)", async () => {
    const before = await countWhere("public.user_events", "user_id", other.id);
    await dbAdmin.execute(sql`insert into public.user_events (user_id, type, activity_id) values (${other.id}, 'view', ${ACTIVITY})`);
    expect(await countWhere("public.user_events", "user_id", other.id)).toBe(before);

    await setConsent(other, "profiling", true);
    await dbAdmin.execute(sql`insert into public.user_events (user_id, type, activity_id) values (${other.id}, 'view', ${ACTIVITY})`);
    expect(await countWhere("public.user_events", "user_id", other.id)).toBe(before + 1);
  });

  it("la revoca cancella eventi e profilo, il registro conserva la scelta", async () => {
    await setConsent(other, "profiling", false);
    expect(await countWhere("public.user_events", "user_id", other.id)).toBe(0);
    const [row] = await dbAdmin.execute<{ granted: boolean }>(sql`
      select granted from public.user_consents where user_id = ${other.id} and kind = 'profiling' order by id desc limit 1`);
    expect(row?.granted).toBe(false);
  });
});

describe("quota delle operazioni sensibili", () => {
  it("tre tentativi al giorno per utente, poi negati (fail closed)", async () => {
    // Il bucket richiede una chiave: nei test la impostiamo qui (non esce dal processo di test).
    process.env.RATE_LIMIT_SECRET = "int-82-quota-secret";
    const user: DbUser = { id: randomUUID() };
    const results: boolean[] = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await userQuotaAllowed(user, "guest-delete", 3, 24 * 60 * 60));
    }
    expect(results).toEqual([true, true, true, false]);
  });
});
