import { describe, expect, it } from "vitest";
import { chooseCandidate, importSlug, nearestPlace, type ActivityRef, type PlaceRef } from "./matching";

const etnaActivity: ActivityRef = {
  id: "act-1",
  title: "Escursione Etna al tramonto",
  placeId: "pl-1",
  placeName: "Catania",
  lat: 37.751,
  lng: 14.9934,
};

describe("chooseCandidate", () => {
  it("collega un prodotto vicino (meno di 2 km) con nome simile", () => {
    const product = { title: "Etna al tramonto: escursione in jeep", lat: 37.752, lng: 14.995, city: null };
    expect(chooseCandidate(product, [etnaActivity])?.activityId).toBe("act-1");
  });

  it("non collega un prodotto lontano anche se il nome è uguale", () => {
    const product = { title: "Escursione Etna al tramonto", lat: 37.9, lng: 14.9, city: null };
    expect(chooseCandidate(product, [etnaActivity])).toBeNull();
  });

  it("non collega un prodotto vicino con nome diverso", () => {
    const product = { title: "Cooking class", lat: 37.751, lng: 14.9934, city: null };
    expect(chooseCandidate(product, [etnaActivity])).toBeNull();
  });

  it("senza coordinate usa il nome della città uguale al luogo", () => {
    const product = { title: "Escursione Etna al tramonto", lat: null, lng: null, city: "catania" };
    expect(chooseCandidate(product, [etnaActivity])?.activityId).toBe("act-1");
    expect(chooseCandidate({ ...product, city: "Palermo" }, [etnaActivity])).toBeNull();
  });

  it("tra più candidate vince la più simile, a parità l'id più piccolo", () => {
    const close: ActivityRef = { ...etnaActivity, id: "act-2", title: "Escursione Etna" };
    const product = { title: "Escursione Etna al tramonto", lat: 37.751, lng: 14.9934, city: null };
    expect(chooseCandidate(product, [close, etnaActivity])?.activityId).toBe("act-1");
    const twinA: ActivityRef = { ...etnaActivity, id: "b" };
    const twinB: ActivityRef = { ...etnaActivity, id: "a" };
    expect(chooseCandidate(product, [twinA, twinB])?.activityId).toBe("a");
  });
});

describe("nearestPlace", () => {
  const places: PlaceRef[] = [
    { id: "p-far", name: "Ragusa", lat: 36.93, lng: 14.73 },
    { id: "p-near", name: "Catania centro", lat: 37.5, lng: 15.09 },
  ];

  it("sceglie il luogo più vicino entro 15 km", () => {
    expect(nearestPlace({ title: "x", lat: 37.49, lng: 15.08, city: null }, places)?.id).toBe("p-near");
  });

  it("null fuori zona", () => {
    expect(nearestPlace({ title: "x", lat: 45, lng: 9, city: null }, places)).toBeNull();
  });

  it("senza coordinate cerca il luogo con lo stesso nome della città", () => {
    expect(nearestPlace({ title: "x", lat: null, lng: null, city: "RAGUSA" }, places)?.id).toBe("p-far");
    expect(nearestPlace({ title: "x", lat: null, lng: null, city: "Noto" }, places)).toBeNull();
  });
});

describe("importSlug", () => {
  it("normalizza l'ID del partner nello slug", () => {
    expect(importSlug("viator", "5731P1")).toBe("imp-viator-5731p1");
    expect(importSlug("getyourguide", "  AB/77 è  ")).toBe("imp-getyourguide-ab-77-e");
  });

  it("null se l'ID non ha caratteri utili", () => {
    expect(importSlug("viator", "///")).toBeNull();
  });

  it("taglia lo slug senza lasciare un trattino finale", () => {
    const slug = importSlug("viator", "a".repeat(59) + "-b");
    expect(slug).toBe(`imp-viator-${"a".repeat(59)}`);
  });
});
