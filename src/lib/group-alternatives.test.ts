import { describe, expect, it } from "vitest";
import { nearbyAlternatives, type AlternativeCandidate, type AlternativeStop } from "./group-alternatives";

// Palermo centro e un punto a circa 1 km / 5 km / 40 km.
const stop: AlternativeStop = { activityId: "stop", area: "palermo", lat: 38.1157, lng: 13.3615 };

function candidate(overrides: Partial<AlternativeCandidate> & Pick<AlternativeCandidate, "activityId">): AlternativeCandidate {
  return {
    title: overrides.activityId,
    placeName: "Luogo",
    area: "palermo",
    lat: 38.1157,
    lng: 13.3615,
    rating: 4,
    ...overrides,
  };
}

describe("nearbyAlternatives", () => {
  it("esclude la tappa stessa e le attività già nel viaggio", () => {
    const catalog = [
      candidate({ activityId: "stop" }),
      candidate({ activityId: "in-trip" }),
      candidate({ activityId: "free" }),
    ];
    const result = nearbyAlternatives(stop, catalog, new Set(["in-trip"]));
    expect(result.map((r) => r.activityId)).toEqual(["free"]);
  });

  it("accetta la stessa area anche oltre il raggio, ma non altre aree lontane", () => {
    const catalog = [
      candidate({ activityId: "same-area-far", area: "palermo", lat: 38.5, lng: 13.3615 }),
      candidate({ activityId: "other-area-far", area: "trapani", lat: 38.5, lng: 13.3615 }),
    ];
    const result = nearbyAlternatives(stop, catalog, new Set());
    expect(result.map((r) => r.activityId)).toEqual(["same-area-far"]);
  });

  it("accetta un'altra area entro 15 km", () => {
    const catalog = [candidate({ activityId: "near-other-area", area: "monreale", lat: 38.1, lng: 13.3 })];
    const result = nearbyAlternatives(stop, catalog, new Set());
    expect(result).toHaveLength(1);
    expect(result[0]?.distanceKm).toBeGreaterThan(0);
    expect(result[0]?.distanceKm).toBeLessThanOrEqual(15);
  });

  it("ordina per voto decrescente, poi distanza, poi id; al massimo due", () => {
    const catalog = [
      candidate({ activityId: "b", rating: 4.5, lat: 38.12, lng: 13.36 }),
      candidate({ activityId: "a", rating: 4.5, lat: 38.1158, lng: 13.3616 }),
      candidate({ activityId: "c", rating: 3, lat: 38.1157, lng: 13.3615 }),
      candidate({ activityId: "d", rating: null, lat: 38.1157, lng: 13.3615 }),
    ];
    const result = nearbyAlternatives(stop, catalog, new Set());
    expect(result.map((r) => r.activityId)).toEqual(["a", "b"]);
  });

  it("torna vuoto se non c'è nulla di vicino", () => {
    expect(nearbyAlternatives(stop, [], new Set())).toEqual([]);
  });
});
