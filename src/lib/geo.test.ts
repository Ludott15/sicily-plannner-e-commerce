import { describe, expect, it } from "vitest";
import { boundsOf } from "./geo";

describe("boundsOf", () => {
  it("senza punti non c'è un rettangolo", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("un solo punto: sud-ovest e nord-est coincidono, in ordine [lng, lat]", () => {
    expect(boundsOf([{ lat: 37.5, lng: 15.1 }])).toEqual({ sw: [15.1, 37.5], ne: [15.1, 37.5] });
  });

  it("contiene tutti i punti, anche con coordinate in ordine sparso", () => {
    const points = [
      { lat: 38.1, lng: 13.3 },
      { lat: 36.8, lng: 14.9 },
      { lat: 37.6, lng: 15.1 },
      { lat: 37.2, lng: 12.6 },
    ];
    expect(boundsOf(points)).toEqual({ sw: [12.6, 36.8], ne: [15.1, 38.1] });
  });

  it("non modifica l'array di ingresso", () => {
    const points = [
      { lat: 2, lng: 1 },
      { lat: 1, lng: 2 },
    ];
    const copy = points.map((p) => ({ ...p }));
    boundsOf(points);
    expect(points).toEqual(copy);
  });
});
