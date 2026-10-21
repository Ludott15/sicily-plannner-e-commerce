import { describe, expect, it } from "vitest";
import type { RouteLeg } from "@/lib/maps/legs";
import {
  FIT_MAX_ZOOM,
  FIT_PADDING,
  PALETTE_TOKENS,
  bezierArc,
  groupBySpot,
  isHiddenLayer,
  midpointOf,
  paletteFor,
  readPalette,
  routeCollections,
  routeSegments,
  spiderLinesCollection,
  spiderOffsets,
  spiderRadiusPx,
  type MapPalette,
  type MapPoint,
} from "./map-style";

// I valori sono nomi di prova: la palette vera arriva dalle variabili CSS dei token (nessun colore qui).
const palette: MapPalette = {
  land: "land-value",
  water: "water-value",
  waterway: "waterway-value",
  park: "park-value",
  building: "building-value",
  road: "road-value",
  boundary: "boundary-value",
  text: "text-value",
  halo: "halo-value",
  route: "route-value",
};

const A: MapPoint = { id: "a", lat: 38.0, lng: 12.5, label: "A", number: 1, placeId: "p1" };
const B: MapPoint = { id: "b", lat: 38.1, lng: 12.6, label: "B", number: 2, placeId: "p2" };
const C: MapPoint = { id: "c", lat: 38.2, lng: 12.7, label: "C", number: 3, placeId: "p3" };

function leg(from: string, to: string, coordinates: [number, number][]): RouteLeg {
  return { fromPlaceId: from, toPlaceId: to, distanceM: 18000, durationS: 1500, coordinates };
}

describe("readPalette", () => {
  it("legge ogni token con la sua variabile CSS e toglie gli spazi", () => {
    const values: Record<string, string> = { "--mare-tint": " water-value " };
    const result = readPalette((token) => values[token] ?? "");
    expect(result.water).toBe("water-value");
    expect(result.land).toBe("");
    expect(Object.keys(result).sort()).toEqual(Object.keys(PALETTE_TOKENS).sort());
  });
});

describe("paletteFor", () => {
  it("colora sfondo e terra", () => {
    expect(paletteFor({ id: "background", type: "background" }, palette)).toEqual([
      { layerId: "background", property: "background-color", value: "land-value" },
    ]);
  });

  it("distingue acqua, parchi ed edifici tra i riempimenti", () => {
    expect(paletteFor({ id: "water", type: "fill" }, palette)[0]?.value).toBe("water-value");
    expect(paletteFor({ id: "park", type: "fill" }, palette)[0]?.value).toBe("park-value");
    expect(paletteFor({ id: "building", type: "fill" }, palette)[0]?.value).toBe("building-value");
  });

  it("colora fiumi, strade e confini come linee", () => {
    expect(paletteFor({ id: "waterway_river", type: "line" }, palette)[0]?.value).toBe("waterway-value");
    expect(paletteFor({ id: "road_primary", type: "line" }, palette)[0]?.value).toBe("road-value");
    expect(paletteFor({ id: "boundary_2", type: "line" }, palette)[0]?.value).toBe("boundary-value");
  });

  it("colora testo e alone delle etichette", () => {
    expect(paletteFor({ id: "label_city", type: "symbol" }, palette).map((p) => p.property)).toEqual([
      "text-color",
      "text-halo-color",
    ]);
  });

  it("non tocca i livelli sconosciuti e i colori mancanti", () => {
    expect(paletteFor({ id: "poi_icon", type: "circle" }, palette)).toEqual([]);
    expect(paletteFor({ id: "background", type: "background" }, { ...palette, land: "" })).toEqual([]);
  });
});

describe("isHiddenLayer", () => {
  it("nasconde icone dei luoghi, scudi e frecce delle strade", () => {
    for (const id of ["poi_r7", "poi_transit", "airport", "road_one_way_arrow", "highway-shield-non-us", "road_shield_us"]) {
      expect(isHiddenLayer(id), id).toBe(true);
    }
  });

  it("nasconde le etichette minori: strade minori e paesi piccoli", () => {
    for (const id of ["highway-name-minor", "highway-name-path", "label_other", "label_village"]) {
      expect(isHiddenLayer(id), id).toBe(true);
    }
  });

  it("lascia città, paesi, regioni, acqua e strade principali", () => {
    for (const id of ["label_city", "label_town", "label_state", "label_country_2", "water_name_point_label", "highway-name-major", "road_motorway", "water"]) {
      expect(isHiddenLayer(id), id).toBe(false);
    }
  });
});

describe("spiderfy: tappe nello stesso luogo", () => {
  it("raggruppa per coordinata senza fondere i marker: ogni tappa resta un punto a parte", () => {
    const groups = groupBySpot([A, { ...A, id: "a2", number: 2 }, C]);
    expect(groups.map((g) => g.points.map((p) => p.id))).toEqual([["a", "a2"], ["c"]]);
  });

  it("il raggio in pixel cresce con il numero di tappe e si stringe a zoom bassi", () => {
    expect(spiderRadiusPx(3, 14)).toBeGreaterThan(spiderRadiusPx(2, 14));
    expect(spiderRadiusPx(2, 6)).toBeLessThan(spiderRadiusPx(2, 14));
  });

  it("con un solo punto non c'è spostamento", () => {
    expect(spiderOffsets(1, 30)).toEqual([{ x: 0, y: 0 }]);
  });

  it("due tappe si dispongono a raggiera, una in alto e una in basso", () => {
    const [top, bottom] = spiderOffsets(2, 30);
    expect(top!.x).toBeCloseTo(0);
    expect(top!.y).toBeCloseTo(-30);
    expect(bottom!.y).toBeCloseTo(30);
  });

  it("tante tappe restano separate: il raggio non scende sotto i 28 px di un marker", () => {
    const offsets = spiderOffsets(12, 10);
    const distances = offsets.map((o, i) => {
      const next = offsets[(i + 1) % offsets.length]!;
      return Math.hypot(next.x - o.x, next.y - o.y);
    });
    for (const d of distances) expect(d).toBeGreaterThanOrEqual(27);
  });

  it("le linee di collegamento vanno dal punto reale al marker spostato", () => {
    const lines = spiderLinesCollection([{ from: [12.5, 38], to: [12.5001, 38.0001] }]);
    expect(lines.features[0]?.geometry.coordinates).toEqual([
      [12.5, 38],
      [12.5001, 38.0001],
    ]);
  });
});

describe("bezierArc", () => {
  it("parte e arriva sui due punti e non è una retta", () => {
    const arc = bezierArc([12.5, 38], [12.6, 38.1]);
    expect(arc[0]).toEqual([12.5, 38]);
    expect(arc.at(-1)).toEqual([12.6, 38.1]);
    // Il punto a metà dell'arco non coincide con il punto medio della retta (12.55, 38.05).
    const mid = arc[Math.floor(arc.length / 2)]!;
    expect(Math.hypot(mid[0] - 12.55, mid[1] - 38.05)).toBeGreaterThan(0.001);
  });
});

describe("routeSegments", () => {
  it("usa la tratta stradale quando esiste per la coppia ordinata", () => {
    const route = [leg("p1", "p2", [[12.5, 38], [12.55, 38.05], [12.6, 38.1]])];
    const [first, second] = routeSegments([A, B, C], route);
    expect(first?.kind).toBe("leg");
    expect(first?.coordinates).toEqual(route[0]!.coordinates);
    expect(second?.kind).toBe("arc");
  });

  it("senza tratta calcolata la coppia diventa un arco, mai una retta", () => {
    const [segment] = routeSegments([A, B], []);
    expect(segment?.kind).toBe("arc");
    expect(segment?.coordinates.length).toBeGreaterThan(2);
  });

  it("la direzione conta: il percorso inverso è una tratta a parte", () => {
    const [segment] = routeSegments([B, A], [leg("p1", "p2", [[12.5, 38], [12.6, 38.1]])]);
    expect(segment?.kind).toBe("arc");
  });

  it("due tappe nello stesso luogo non hanno linea", () => {
    const [segment] = routeSegments([A, { ...A, id: "a2", number: 2 }], []);
    expect(segment?.kind).toBe("same");
  });
});

describe("midpointOf e routeCollections", () => {
  it("la freccia sta a metà della tratta e punta verso nord su una linea nord-sud", () => {
    const mid = midpointOf([
      [12.5, 38],
      [12.5, 38.2],
    ]);
    expect(mid?.point[1]).toBeCloseTo(38.1);
    expect(mid?.bearing).toBeCloseTo(0);
  });

  it("evidenzia la tratta che tocca la tappa attiva", () => {
    const segments = routeSegments(
      [A, B, C],
      [leg("p1", "p2", [[12.5, 38], [12.6, 38.1]])],
    );
    const collections = routeCollections(segments, "b");
    expect(collections.legs.features.map((f) => f.properties.active)).toEqual([true]);
    expect(collections.arcs.features.map((f) => f.properties.active)).toEqual([true]);
    expect(collections.arrows).toHaveLength(1);
  });

  it("senza tappa attiva nessuna tratta è evidenziata", () => {
    const collections = routeCollections(routeSegments([A, B], []), null);
    expect(collections.arcs.features.map((f) => f.properties.active)).toEqual([false]);
  });
});

describe("vista sui punti", () => {
  it("usa lo stesso margine su tutti i lati e uno zoom massimo di 13", () => {
    expect(FIT_PADDING).toBe(48);
    expect(FIT_MAX_ZOOM).toBe(13);
  });
});
