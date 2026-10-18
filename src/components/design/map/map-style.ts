// Stile della mappa (docs/design/components/Map/README.md). Pura: nessuna dipendenza dal DOM.
// I colori non sono scritti nel codice: arrivano dalle variabili CSS dei token (tokens.json),
// lette dal contenitore della mappa e quindi corrette nel tema attivo.

import type { Feature, LineString } from "geojson";

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// Centro di Sicilia e zoom per una mappa senza punti.
export const SICILY_CENTER: { lng: number; lat: number } = { lng: 13.9, lat: 37.6 };
export const SICILY_ZOOM = 7;

// Vista sui punti: margine uguale su tutti i lati (più dei marker, 28 px) e zoom massimo, così un solo
// luogo non porta a livello di strada.
export const FIT_PADDING = 48;
export const FIT_MAX_ZOOM = 13;

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** Numero del marker (come le tappe). Senza numero il marker è un punto. */
  number?: number;
};

// Chiave del colore -> variabile CSS del token.
export const PALETTE_TOKENS = {
  land: "--calce-sunk",
  water: "--mare-tint",
  waterway: "--mare",
  park: "--pistacchio-tint",
  building: "--divider",
  road: "--border-control",
  boundary: "--lava-muted",
  text: "--lava",
  halo: "--calce",
  route: "--lava-muted",
} as const;

export type PaletteKey = keyof typeof PALETTE_TOKENS;
export type MapPalette = Record<PaletteKey, string>;

// Proprietà di colore di MapLibre usate dalla palette (tipizzate, non stringhe libere).
export type PaintProperty = "background-color" | "fill-color" | "line-color" | "text-color" | "text-halo-color";

export type PaintPatch = { layerId: string; property: PaintProperty; value: string };

// Legge i colori con la funzione data (in produzione getComputedStyle, nei test una mappa).
// Un token mancante resta stringa vuota: il colore dello stile base non viene toccato.
export function readPalette(read: (token: string) => string): MapPalette {
  const entries = (Object.keys(PALETTE_TOKENS) as PaletteKey[]).map(
    (key) => [key, read(PALETTE_TOKENS[key]).trim()] as const,
  );
  return Object.fromEntries(entries) as MapPalette;
}

const WATERWAY = /waterway|river|stream|canal|rail_?ferry/;
const WATER = /water/;
const PARK = /park|grass|wood|forest|landcover|landuse|nature/;
const BUILDING = /building/;
const ROAD = /road|highway|motorway|street|bridge|tunnel|path|track|rail|transit|ferry|aeroway|transportation/;
const BOUNDARY = /boundary|admin/;

// Colori per un livello dello stile base (per id e tipo). Nessuna patch per i livelli non riconosciuti.
export function paletteFor(layer: { id: string; type: string }, palette: MapPalette): PaintPatch[] {
  const id = layer.id;
  const patch = (property: PaintProperty, key: PaletteKey): PaintPatch[] =>
    palette[key] ? [{ layerId: id, property, value: palette[key] }] : [];

  switch (layer.type) {
    case "background":
      return patch("background-color", "land");
    case "fill":
      if (WATER.test(id)) return patch("fill-color", "water");
      if (PARK.test(id)) return patch("fill-color", "park");
      if (BUILDING.test(id)) return patch("fill-color", "building");
      return patch("fill-color", "land");
    case "line":
      if (WATERWAY.test(id)) return patch("line-color", "waterway");
      if (BOUNDARY.test(id)) return patch("line-color", "boundary");
      if (ROAD.test(id)) return patch("line-color", "road");
      return [];
    case "symbol":
      return [...patch("text-color", "text"), ...patch("text-halo-color", "halo")];
    default:
      return [];
  }
}

// Linea del percorso tra i punti nell'ordine: una sola linea per giorno.
export function routeGeoJson(points: readonly MapPoint[]): Feature<LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) },
  };
}

// Layer dello stile base da nascondere per una mappa più sobria: icone dei luoghi (poi_*, aeroporti),
// scudi e frecce delle strade, nomi delle strade minori e dei paesi piccoli. Restano città, paesi,
// regioni, nomi d'acqua e strade principali.
const HIDDEN_LAYER = /^(poi_|airport$|road_one_way_arrow|highway-shield-|road_shield_us$|highway-name-(path|minor)$|label_(other|village)$)/;

export function isHiddenLayer(id: string): boolean {
  return HIDDEN_LAYER.test(id);
}

// Un marker per coordinata: più tappe nello stesso luogo stanno su un solo punto, con i numeri uniti
// da un punto mediano ("1·2"). Senza numeri il gruppo è un punto semplice.
export type MarkerGroup = { key: string; lat: number; lng: number; text: string; numbered: boolean };

export function groupMarkers(points: readonly MapPoint[]): MarkerGroup[] {
  const groups = new Map<string, { lat: number; lng: number; numbers: number[] }>();
  for (const point of points) {
    const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
    const group = groups.get(key) ?? { lat: point.lat, lng: point.lng, numbers: [] };
    if (point.number !== undefined) group.numbers.push(point.number);
    groups.set(key, group);
  }
  return [...groups].map(([key, group]) => ({
    key,
    lat: group.lat,
    lng: group.lng,
    text: group.numbers.join("·"),
    numbered: group.numbers.length > 0,
  }));
}
