import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "./admin";
import { closeConnection } from "./connection";
import { dbPublic } from "./public";
import { activities, activityInterests, itineraries, places, profiles } from "./schema";

const placeId = randomUUID();
const activeId = randomUUID();
const inactiveId = randomUUID();
const suffix = Date.now();

beforeAll(async () => {
  await dbAdmin.transaction(async (tx) => {
    await tx.insert(places).values({ id: placeId, slug: `int-place-${suffix}`, name: "Int", province: "PA", lat: 38, lng: 13 });
    await tx.insert(activities).values([
      { id: activeId, slug: `int-active-${suffix}`, placeId, title: "Attiva", durationMin: 60, isActive: true },
      { id: inactiveId, slug: `int-inactive-${suffix}`, placeId, title: "Inattiva", durationMin: 60 },
    ]);
    // Il trigger activities_require_tags controlla al commit: l'attiva ha un tag.
    await tx.insert(activityInterests).values({ activityId: activeId, interestKey: "sea", strength: 2 });
  });
});

afterAll(async () => {
  // I tag si eliminano a cascata con l'attività (togliere prima i tag di un'attività
  // attiva violerebbe activities_require_tags).
  await dbAdmin.delete(activities).where(inArray(activities.id, [activeId, inactiveId]));
  await dbAdmin.delete(places).where(eq(places.id, placeId));
  await closeConnection();
});

describe("dbPublic", () => {
  it("usa il ruolo anon senza utente", async () => {
    const [row] = await dbPublic((tx) =>
      tx.execute<{ role: string; uid: string | null }>(sql`select current_user as role, auth.uid() as uid`),
    );
    expect(row).toEqual({ role: "anon", uid: null });
  });

  it("vede le attività attive e non quelle inattive", async () => {
    const rows = await dbPublic((tx) =>
      tx
        .select({ id: activities.id })
        .from(activities)
        .where(inArray(activities.id, [activeId, inactiveId])),
    );
    expect(rows).toEqual([{ id: activeId }]);
  });

  it("non vede gli itinerari personali", async () => {
    const rows = await dbPublic((tx) =>
      tx.select({ id: itineraries.id }).from(itineraries).where(eq(itineraries.isTemplate, false)),
    );
    expect(rows).toEqual([]);
  });

  it("non legge i profili", async () => {
    await expect(dbPublic((tx) => tx.select().from(profiles).limit(1))).rejects.toThrow();
  });

  it("non scrive nel catalogo", async () => {
    await expect(
      dbPublic((tx) => tx.update(activities).set({ title: "hack" }).where(eq(activities.id, activeId))),
    ).rejects.toThrow();
  });
});
