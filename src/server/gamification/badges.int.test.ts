import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { getMyBadges } from "./badges";
import { saveBadge } from "./badges.admin";

// Badge con il database reale: valutazione dopo un accredito di punti (trigger sul ledger) e
// salvataggio di un badge dall'admin con l'audit. Dati con prefisso int- e pulizia a fine suite.

const admin = vi.hoisted(() => ({ id: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/server/auth", () => ({
  requireAdmin: async () => ({ user: { id: admin.id }, profile: null }),
}));

const stamp = Date.now();
const user = { id: randomUUID(), email: `int-badge-${stamp}@example.com`, is_anonymous: false };
const adminUser = { id: randomUUID(), email: `int-badge-admin-${stamp}@example.com`, is_anonymous: false };
const placeId = randomUUID();
const itineraryId = randomUUID();
const badgeKey = `int-badge-${stamp}`;

beforeAll(async () => {
  admin.id = adminUser.id;
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, is_anonymous, created_at, updated_at, last_sign_in_at)
    values
      (${user.id}, ${user.email}, false, now(), now(), now()),
      (${adminUser.id}, ${adminUser.email}, false, now(), now(), now())
  `);
  await dbAdmin.execute(sql`update public.profiles set role = 'admin' where id = ${adminUser.id}`);
  await dbAdmin.execute(sql`
    insert into public.places (id, slug, name, province, lat, lng)
    values (${placeId}, ${`int-badge-${stamp}`}, 'int Luogo badge', 'CT', 37.79, 14.83)
  `);
  await dbAdmin.execute(sql`
    insert into public.itineraries (id, owner_id, title, days)
    values (${itineraryId}, ${user.id}, 'int-viaggio badge', 1)
  `);
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from public.badges where key = ${badgeKey}`);
  // L'utente admin resta: admin_audit_log è immutabile e il suo actor_id non si può annullare.
  // Lo elimina scripts/db/clean-test-data.mjs (utenti int-).
  await dbAdmin.execute(sql`delete from auth.users where id = ${user.id}`);
  await dbAdmin.execute(sql`delete from public.places where id = ${placeId}`);
});

describe("badge con il database", () => {
  it("un itinerario completato assegna primo-viaggio, con la notifica", async () => {
    await dbAdmin.execute(sql`
      select public.award_points(${user.id}::uuid, 100, 'itinerary_completed', 'itinerary', ${itineraryId}::uuid)
    `);

    const badges = await getMyBadges(user, "it");
    const earned = badges.earned.find((b) => b.key === "primo-viaggio");
    expect(earned?.name).toBe("Primo viaggio");
    expect(earned?.awardedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(badges.next.some((b) => b.key === "primo-viaggio")).toBe(false);

    const [row] = await dbAdmin.execute<{ n: number }>(sql`
      select count(*)::int as n from public.notifications
      where user_id = ${user.id} and kind = 'badge_earned' and payload->>'badgeKey' = 'primo-viaggio'
    `);
    expect(row?.n).toBe(1);
  });

  it("i badge non ancora ottenuti hanno progresso e soglia", async () => {
    const badges = await getMyBadges(user, "en");
    const buongustaio = badges.next.find((b) => b.key === "buongustaio");
    expect(buongustaio).toEqual({ key: "buongustaio", name: "Food lover", current: 0, target: 5 });
  });

  it("saveBadge crea un badge e registra l'audit", async () => {
    const form = new FormData();
    form.set("locale", "it");
    form.set("mode", "create");
    form.set("key", badgeKey);
    form.set("nameIt", "Prova int");
    form.set("nameEn", "Int test");
    form.set("description", "");
    form.set("criteriaType", "group_size");
    form.set("min", "3");
    form.set("province", "");
    form.set("interest", "");

    const result = await saveBadge({ status: "idle" }, form);
    expect(result).toEqual({ status: "saved" });

    const [badge] = await dbAdmin.execute<{ name_it: string; criteria: { type: string; min: number } }>(sql`
      select name_it, criteria from public.badges where key = ${badgeKey}
    `);
    expect(badge?.name_it).toBe("Prova int");
    expect(badge?.criteria).toEqual({ type: "group_size", min: 3 });

    const [audit] = await dbAdmin.execute<{ n: number }>(sql`
      select count(*)::int as n from public.admin_audit_log
      where action = 'badge.save' and actor_id = ${adminUser.id} and diff->>'key' = ${badgeKey}
    `);
    expect(audit?.n).toBe(1);
  });

  it("saveBadge non crea una seconda volta una chiave esistente", async () => {
    const form = new FormData();
    form.set("locale", "it");
    form.set("mode", "create");
    form.set("key", badgeKey);
    form.set("nameIt", "Altro nome");
    form.set("nameEn", "Other name");
    form.set("description", "");
    form.set("criteriaType", "group_size");
    form.set("min", "3");
    form.set("province", "");
    form.set("interest", "");

    expect(await saveBadge({ status: "idle" }, form)).toEqual({ status: "error", code: "slug_taken" });
  });
});
