import { describe, expect, it } from "vitest";
import {
  FIT_MAX_ZOOM,
  FIT_PADDING,
  PALETTE_TOKENS,
  groupMarkers,
  isHiddenLayer,
  paletteFor,
  readPalette,
  routeGeoJson,
  type MapPalette,
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

describe("routeGeoJson", () => {
  it("collega i punti nell'ordine dato, in coordinate [lng, lat]", () => {
    const line = routeGeoJson([
      { id: "a", lat: 38.0, lng: 12.5, label: "A" },
      { id: "b", lat: 38.1, lng: 12.6, label: "B", number: 2 },
    ]);
    expect(line.geometry.coordinates).toEqual([
      [12.5, 38.0],
      [12.6, 38.1],
    ]);
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

describe("groupMarkers", () => {
  it("unisce le tappe nello stesso luogo in un marker con i numeri", () => {
    const groups = groupMarkers([
      { id: "a", lat: 38.0, lng: 12.5, label: "A", number: 1 },
      { id: "b", lat: 38.0, lng: 12.5, label: "B", number: 2 },
      { id: "c", lat: 38.1, lng: 12.6, label: "C", number: 3 },
    ]);
    expect(groups.map((g) => g.text)).toEqual(["1·2", "3"]);
    expect(groups.every((g) => g.numbered)).toBe(true);
  });

  it("i punti senza numero restano punti semplici", () => {
    const groups = groupMarkers([
      { id: "a", lat: 38.0, lng: 12.5, label: "A" },
      { id: "b", lat: 38.0, lng: 12.5, label: "B" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.numbered).toBe(false);
    expect(groups[0]?.text).toBe("");
  });

  it("senza punti non ci sono marker", () => {
    expect(groupMarkers([])).toEqual([]);
  });
});

describe("vista sui punti", () => {
  it("usa lo stesso margine su tutti i lati e uno zoom massimo di 13", () => {
    expect(FIT_PADDING).toBe(48);
    expect(FIT_MAX_ZOOM).toBe(13);
  });
});
