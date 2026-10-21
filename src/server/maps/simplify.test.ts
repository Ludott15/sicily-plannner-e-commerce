import { describe, expect, it } from "vitest";
import { simplifyLine, type LngLat } from "./simplify";

// 1 grado di latitudine ≈ 110.574 km: 0,0001 grado ≈ 11 m, 0,0003 ≈ 33 m.
const LAT_10M = 10 / 110_574;
const LAT_100M = 100 / 110_574;

describe("simplifyLine", () => {
  it("lascia intatte le linee con due punti", () => {
    const line: LngLat[] = [
      [14.2, 37.5],
      [14.3, 37.6],
    ];
    expect(simplifyLine(line)).toEqual(line);
  });

  it("toglie i punti quasi allineati e tiene gli estremi", () => {
    const line: LngLat[] = [
      [14.0, 37.5],
      [14.01, 37.5 + LAT_10M],
      [14.02, 37.5 - LAT_10M],
      [14.03, 37.5],
    ];
    expect(simplifyLine(line, 30)).toEqual([line[0], line[3]]);
  });

  it("tiene il punto che si scosta più della tolleranza", () => {
    const line: LngLat[] = [
      [14.0, 37.5],
      [14.01, 37.5 + LAT_100M],
      [14.02, 37.5],
    ];
    expect(simplifyLine(line, 30)).toEqual(line);
  });

  it("non supera il massimo di punti alzando la tolleranza", () => {
    const line: LngLat[] = Array.from({ length: 2000 }, (_, i) => {
      const angle = i / 40;
      return [14 + i * 0.0005, 37.5 + Math.sin(angle) * 0.02];
    });
    const simplified = simplifyLine(line, 30, 400);
    expect(simplified.length).toBeLessThanOrEqual(400);
    expect(simplified[0]).toEqual(line[0]);
    expect(simplified[simplified.length - 1]).toEqual(line[line.length - 1]);
  });

  it("non modifica l'array in ingresso", () => {
    const line: LngLat[] = [
      [14.0, 37.5],
      [14.01, 37.5 + LAT_100M],
      [14.02, 37.5],
    ];
    const copy = line.map((p) => [...p] as LngLat);
    simplifyLine(line, 30);
    expect(line).toEqual(copy);
  });
});
