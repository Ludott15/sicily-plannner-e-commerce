import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { activities, activityInterests, places } from "@/server/db/schema";
import { nearbyActivities } from "@/server/catalog/queries";

// "Sulla mappa" della pagina del luogo (nearbyActivities), letta come il pubblico (dbPublic).
// Tutto ha il prefisso int-; le attività attive ricevono un interesse prima dell'attivazione
// (trigger activities_require_tags) e nascono inattive come nell'import.

const tag = `n${Date.now()}`;
const id = () => randomUUID();
const slug = (name: string) => `int-nearby-${name}-${tag}`;

// Luogo di partenza: 37.0 N, 15.0 E.
const origin = id();
const inactiveOrigin = id();
const near = id();
const edge = id();
const beyondRadius = id();
const inactivePlace = id();
const far = id();

const allPlaceIds = [origin, inactiveOrigin, near, edge, beyondRadius, inactivePlace, far];

const act = {
  sameB: id(),
  sameA: id(),
  inactiveSame: id(),
  nearAct: id(),
  edgeAct: id(),
  beyondAct: id(),
  inactivePlaceAct: id(),
  farAct: id(),
  otherOrigin: id(),
};

const allActivityIds = Object.values(act);

const place = (pid: string, name: string, lat: number, lng: number, isActive = true) => ({
  id: pid,
  slug: slug(name),
  name: `int- ${name}`,
  province: "SR",
  lat,
  lng,
  isActive,
});

const activity = (aid: string, placeId: string, title: string) => ({
  id: aid,
  slug: slug(aid),
  placeId,
  title,
  durationMin: 60,
  seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  isActive: false,
});

beforeAll(async () => {
  await dbAdmin.transaction(async (tx) => {
    await tx.insert(places).values([
      place(origin, "origine", 37.0, 15.0),
      place(inactiveOrigin, "origine-inattiva", 37.0, 15.0, false),
      place(near, "vicino", 37.05, 15.05),
      // A circa 13 km: dentro il raggio (la query SQL lo prende con la fascia di latitudine).
      place(edge, "bordo", 37.12, 15.0),
      // A circa 22 km in longitudine: fuori dal raggio anche se nella fascia di latitudine.
      place(beyondRadius, "oltre-raggio", 37.0, 15.25),
      place(inactivePlace, "luogo-inattivo", 37.01, 15.01, false),
      place(far, "lontano", 37.5, 15.0),
    ]);

    await tx.insert(activities).values([
      activity(act.sameB, origin, "int- b stesso luogo"),
      activity(act.sameA, origin, "int- a stesso luogo"),
      activity(act.inactiveSame, origin, "int- inattiva stesso luogo"),
      activity(act.nearAct, near, "int- vicina"),
      activity(act.edgeAct, edge, "int- al bordo"),
      activity(act.beyondAct, beyondRadius, "int- oltre raggio"),
      activity(act.inactivePlaceAct, inactivePlace, "int- luogo inattivo"),
      activity(act.farAct, far, "int- lontana"),
      activity(act.otherOrigin, inactiveOrigin, "int- attiva in luogo inattivo"),
    ]);

    await tx.insert(activityInterests).values(
      allActivityIds.map((activityId) => ({ activityId, interestKey: "sea", strength: 2 })),
    );

    // Attivazione dopo i tag. Le attività dei luoghi inattivi restano inattive (trigger activity_place_inactive).
    await tx
      .update(activities)
      .set({ isActive: true })
      .where(inArray(activities.id, [act.sameA, act.sameB, act.nearAct, act.edgeAct, act.beyondAct, act.farAct]));
  });
});

afterAll(async () => {
  await dbAdmin.delete(activities).where(inArray(activities.id, allActivityIds));
  await dbAdmin.delete(places).where(inArray(places.id, allPlaceIds));
});

describe("nearbyActivities", () => {
  it("attività attive dello stesso luogo e dei luoghi attivi entro 15 km, per distanza poi per titolo", async () => {
    // Il database locale può avere attività vere nella stessa zona: si guardano solo quelle del test.
    const result = (await nearbyActivities(origin, 50)).filter((r) => (allActivityIds as readonly string[]).includes(r.id));
    expect(result.map((r) => r.id)).toEqual([act.sameA, act.sameB, act.nearAct, act.edgeAct]);
    expect(result[0]).toMatchObject({
      title: "int- a stesso luogo",
      placeName: "int- origine",
      lat: 37.0,
      lng: 15.0,
      distanceKm: 0,
    });
    expect(result[2]!.distanceKm).toBeGreaterThan(0);
    expect(result[2]!.distanceKm).toBeLessThan(10);
    expect(result[3]!.distanceKm).toBeLessThan(15);
    expect(result[3]!.distanceKm).toBeGreaterThan(result[2]!.distanceKm);
  });

  it("esclude attività inattive, luoghi inattivi, luoghi oltre 15 km e luoghi più lontani", async () => {
    const ids = (await nearbyActivities(origin)).map((r) => r.id);
    expect(ids).not.toContain(act.inactiveSame);
    expect(ids).not.toContain(act.beyondAct);
    expect(ids).not.toContain(act.farAct);
    expect(ids).not.toContain(act.inactivePlaceAct);
  });

  it("rispetta il limite", async () => {
    const result = await nearbyActivities(origin, 2);
    expect(result.map((r) => r.id)).toEqual([act.sameA, act.sameB]);
  });

  it("un luogo di partenza inattivo non ha attività vicine", async () => {
    expect(await nearbyActivities(inactiveOrigin)).toEqual([]);
  });

  it("un luogo di partenza inesistente non ha attività vicine", async () => {
    expect(await nearbyActivities(randomUUID())).toEqual([]);
  });
});
