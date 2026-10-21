// Stile della mappa (docs/design/components/Map/README.md). Pura: nessuna dipendenza dal DOM.
// I colori non sono scritti nel codice: arrivano dalle variabili CSS dei token (tokens.json),
// lette dal contenitore della mappa e quindi corrette nel tema attivo.

import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { RouteLeg } from "@/lib/maps/legs";

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
  /** Luogo della tappa: con due luoghi consecutivi si cerca la tratta stradale (place_legs). */
  placeId?: string | null;
  /** Tappa già visitata (per esempio con il check-in di oggi): marker attenuato. */
  visited?: boolean;
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

// Layer dello stile base da nascondere per una mappa più sobria: icone dei luoghi (poi_*, aeroporti),
// scudi e frecce delle strade, nomi delle strade minori e dei paesi piccoli. Restano città, paesi,
// regioni, nomi d'acqua e strade principali.
const HIDDEN_LAYER = /^(poi_|airport$|road_one_way_arrow|highway-shield-|road_shield_us$|highway-name-(path|minor)$|label_(other|village)$)/;

export function isHiddenLayer(id: string): boolean {
  return HIDDEN_LAYER.test(id);
}

// ---------------------------------------------------------------------------------------------
// Tappe nello stesso luogo: ogni tappa ha il suo marker. Le tappe con la stessa coordinata si
// dispongono a raggiera attorno al punto reale (spiderfy), con un raggio in pixel che dipende dallo
// zoom. Il calcolo è in pixel: la conversione pixel <-> coordinate sta in map-canvas.
// ---------------------------------------------------------------------------------------------

export type Vec = { x: number; y: number };

// Raggio della raggiera in pixel: cresce con il numero di tappe e si stringe a zoom bassi (là i
// luoghi vicini restano sotto il dito e la raggiera non deve coprirli).
export function spiderRadiusPx(count: number, zoom: number): number {
  const base = 18 + count * 6;
  const scale = Math.min(1, Math.max(0.6, (zoom - 4) / 8));
  return base * scale;
}

// Spostamenti dei marker dal centro, a raggiera a partire dall'alto e in senso orario. Con un solo
// punto non c'è spostamento. Il raggio non scende sotto quello che tiene separati i marker (28 px).
export function spiderOffsets(count: number, radiusPx: number): Vec[] {
  if (count <= 1) return [{ x: 0, y: 0 }];
  const radius = Math.max(radiusPx, (count * 34) / (2 * Math.PI));
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

// Tappe raggruppate per coordinata, nell'ordine di comparsa. Serve solo a disporre a raggiera.
export type SpotGroup = { lat: number; lng: number; points: MapPoint[] };

export function groupBySpot(points: readonly MapPoint[]): SpotGroup[] {
  const groups = new Map<string, SpotGroup>();
  for (const point of points) {
    const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
    const group = groups.get(key) ?? { lat: point.lat, lng: point.lng, points: [] };
    group.points.push(point);
    groups.set(key, group);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------------------------------------
// Percorso tra le tappe in ordine. Per ogni coppia di tappe consecutive:
// - "leg": la tratta stradale esiste in place_legs; la linea segue le sue coordinate;
// - "arc": la tratta non è ancora calcolata; arco curvo tratteggiato, mai una retta;
// - "same": stesso luogo (stessa coordinata): nessuna linea.
// ---------------------------------------------------------------------------------------------

export type LngLat = [number, number];

export type RouteSegment = {
  fromId: string;
  toId: string;
  kind: "leg" | "arc" | "same";
  coordinates: LngLat[];
  leg: RouteLeg | null;
};

// Arco come curva di Bézier quadratica tra due punti: il controllo sta a un quinto della distanza,
// spostato di lato rispetto al segmento. Pura, in coordinate [lng, lat] (il lato è quello dello
// schermo: come lo stile, è un'approssimazione per tratte corte).
export function bezierArc(from: LngLat, to: LngLat, steps = 32): LngLat[] {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const cx = (x0 + x1) / 2 - (y1 - y0) * 0.2;
  const cy = (y0 + y1) / 2 + (x1 - x0) * 0.2;
  const out: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
  }
  return out;
}

export function routeSegments(points: readonly MapPoint[], legs: readonly RouteLeg[]): RouteSegment[] {
  const byPair = new Map(legs.map((leg) => [`${leg.fromPlaceId}>${leg.toPlaceId}`, leg] as const));
  const segments: RouteSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const start: LngLat = [a.lng, a.lat];
    const end: LngLat = [b.lng, b.lat];
    if (a.lat === b.lat && a.lng === b.lng) {
      segments.push({ fromId: a.id, toId: b.id, kind: "same", coordinates: [start, end], leg: null });
      continue;
    }
    const leg = a.placeId && b.placeId ? (byPair.get(`${a.placeId}>${b.placeId}`) ?? null) : null;
    if (leg) {
      segments.push({ fromId: a.id, toId: b.id, kind: "leg", coordinates: leg.coordinates, leg });
    } else {
      segments.push({ fromId: a.id, toId: b.id, kind: "arc", coordinates: bezierArc(start, end), leg: null });
    }
  }
  return segments;
}

// Punto a metà di una linea (a metà lunghezza, misurata sul piano con la longitudine scalata sulla
// latitudine) e rotta di marcia in gradi dal nord in senso orario, per orientare la freccia.
export function midpointOf(coordinates: readonly LngLat[]): { point: LngLat; bearing: number } | null {
  if (coordinates.length < 2) return null;
  const lat0 = coordinates[0]![1];
  const k = Math.cos((lat0 * Math.PI) / 180);
  const step = (a: LngLat, b: LngLat) => Math.hypot((b[0] - a[0]) * k, b[1] - a[1]);
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) total += step(coordinates[i - 1]!, coordinates[i]!);
  if (total === 0) return null;
  let walked = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1]!;
    const b = coordinates[i]!;
    const len = step(a, b);
    if (walked + len >= total / 2 && len > 0) {
      const t = (total / 2 - walked) / len;
      const point: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const bearing = (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI;
      return { point, bearing: (bearing + 360) % 360 };
    }
    walked += len;
  }
  return null;
}

export type RouteCollections = {
  legs: FeatureCollection<LineString, { active: boolean }>;
  arcs: FeatureCollection<LineString, { active: boolean }>;
  arrows: { point: LngLat; bearing: number }[];
};

// Dati per le sorgenti di MapLibre e per le frecce. La tratta attiva è quella che tocca la tappa
// attiva (in arrivo o in partenza).
export function routeCollections(segments: readonly RouteSegment[], activeId: string | null): RouteCollections {
  const legFeatures: Feature<LineString, { active: boolean }>[] = [];
  const arcFeatures: Feature<LineString, { active: boolean }>[] = [];
  const arrows: { point: LngLat; bearing: number }[] = [];
  for (const segment of segments) {
    if (segment.kind === "same") continue;
    const active = activeId !== null && (segment.fromId === activeId || segment.toId === activeId);
    const feature: Feature<LineString, { active: boolean }> = {
      type: "Feature",
      properties: { active },
      geometry: { type: "LineString", coordinates: segment.coordinates },
    };
    if (segment.kind === "leg") {
      legFeatures.push(feature);
      const mid = midpointOf(segment.coordinates);
      if (mid) arrows.push(mid);
    } else {
      arcFeatures.push(feature);
    }
  }
  return {
    legs: { type: "FeatureCollection", features: legFeatures },
    arcs: { type: "FeatureCollection", features: arcFeatures },
    arrows,
  };
}

// Linee di collegamento tra la tappa reale e il marker spostato dalla raggiera.
export function spiderLinesCollection(
  lines: readonly { from: LngLat; to: LngLat }[],
): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: lines.map((line) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [line.from, line.to] },
    })),
  };
}

export function emptyCollection<G extends Point | LineString>(): FeatureCollection<G> {
  return { type: "FeatureCollection", features: [] };
}
