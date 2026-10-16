import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { adminDashboard } from "./dashboard.admin";

// Dashboard admin sul database locale. Il periodo è nel 2099: nessun dato reale cade lì, quindi i
// conteggi sono esatti anche con dati già presenti. Tutto ha il prefisso int-.

// La dashboard richiede un admin: nel test il controllo è superato, la logica resta quella vera.
vi.mock("@/server/auth", () => ({ requireAdmin: () => Promise.resolve({}) }));

const stamp = Date.now();
const member = randomUUID();
const guest = randomUUID();
const inviter = randomUUID();
const RANGE = { from: "2099-03-01", to: "2099-03-31" };
const groupId = randomUUID();
const itineraryId = randomUUID();

beforeAll(async () => {
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, is_anonymous, created_at, email_confirmed_at) values
      (${member}, ${"int-dash-member-" + stamp + "@example.com"}, false, '2099-03-05 10:00+01', '2099-03-05 10:00+01'),
      (${inviter}, ${"int-dash-inviter-" + stamp + "@example.com"}, false, '2000-01-01 10:00+01', '2000-01-01 10:00+01'),
      (${guest}, null, true, '2099-03-05 11:00+01', null)`);
  await dbAdmin.execute(sql`
    insert into public.groups (id, name, owner_id, created_at) values (${groupId}, 'int-dash gruppo', ${inviter}, '2099-03-05 12:00+01')`);
  await dbAdmin.execute(sql`
    insert into public.itineraries (id, owner_id, title, days, created_at)
    values (${itineraryId}, ${member}, 'int-dash viaggio', 3, '2099-03-05 12:00+01')`);
  await dbAdmin.execute(sql`
    insert into public.affiliate_clicks (user_id, partner, target_url, subid, context, itinerary_id, created_at)
    values (${member}, 'booking', 'https://example.com/int-dash', ${"int-dash-" + stamp}, 'itinerary', ${itineraryId}, '2099-03-06 09:00+01')`);
  await dbAdmin.execute(sql`
    insert into public.group_invites (group_id, token_hash, invited_by, created_at)
    values (${groupId}, ${"a".repeat(64)}, ${inviter}, '2099-03-05 13:00+01')`);
  await dbAdmin.execute(sql`
    insert into public.group_members (group_id, user_id, invited_by, joined_at)
    values (${groupId}, ${member}, ${inviter}, '2099-03-06 13:00+01')`);
  await dbAdmin.execute(sql`
    insert into public.user_events (user_id, type, created_at) values (${member}, 'view', '2099-03-07 10:00+01')`);
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from public.affiliate_clicks where subid = ${"int-dash-" + stamp}`);
  await dbAdmin.execute(sql`delete from public.groups where id = ${groupId}::uuid`);
  await dbAdmin.execute(sql`delete from auth.users where id in (${member}::uuid, ${inviter}::uuid, ${guest}::uuid)`);
});

describe("adminDashboard", () => {
  it("conta nel periodo: utenti, viaggi, click, inviti e attività", async () => {
    const metrics = await adminDashboard(RANGE);
    expect(metrics.newUsers).toBe(1); // l'ospite non conta; l'inviter è del 2000
    expect(metrics.guestsConverted).toBe(0);
    expect(metrics.tripsCreated).toBe(1);
    expect(metrics.tripsWithAffiliateClick).toBe(1);
    expect(metrics.affiliateClicks).toBe(1);
    expect(metrics.commissionsCents).toBe(0);
    expect(metrics.orders).toBe(0);
    expect(metrics.avgOrderCents).toBeNull();
    expect(metrics.activeUsers).toBe(1);
    expect(metrics.aiCostUsd).toBe(0);
    expect(metrics.aiCostPerActiveUserUsd).toBe(0);
    expect(metrics.invitesSent).toBe(1);
    expect(metrics.invitesAccepted).toBe(1);
  });

  it("un periodo senza dati dà zeri e null, non errori", async () => {
    const metrics = await adminDashboard({ from: "2099-04-01", to: "2099-04-02" });
    expect(metrics.newUsers).toBe(0);
    expect(metrics.tripsCreated).toBe(0);
    expect(metrics.activeUsers).toBe(0);
    expect(metrics.aiCostPerActiveUserUsd).toBeNull();
  });
});
