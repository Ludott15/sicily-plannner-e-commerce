"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, LineString } from "geojson";
import { boundsOf } from "@/lib/geo";
import type { RouteLeg } from "@/lib/maps/legs";
import {
  FIT_MAX_ZOOM,
  FIT_PADDING,
  MAP_STYLE_URL,
  SICILY_CENTER,
  SICILY_ZOOM,
  emptyCollection,
  groupBySpot,
  isHiddenLayer,
  paletteFor,
  readPalette,
  routeCollections,
  routeSegments,
  spiderLinesCollection,
  spiderOffsets,
  spiderRadiusPx,
  type LngLat,
  type MapPalette,
  type MapPoint,
} from "./map-style";

// Canvas della mappa (docs/design/components/Map/README.md). Caricato solo quando il contenitore entra
// nello schermo (TripMap): qui sta il CSS di MapLibre, quindi non entra nel bundle iniziale.
// Stile di OpenFreeMap con i colori dei token. Ogni tappa ha il suo marker numerato; le tappe nello
// stesso luogo si dispongono a raggiera, con una linea sottile verso il punto reale. Il percorso segue
// la strada quando la tratta è in place_legs; altrimenti è un arco tratteggiato (mai una retta).
// La tappa attiva si evidenzia sul percorso e sul marker; il cambio di tappa centra la mappa.
// I marker sono nascosti allo screen reader: la navigazione accessibile sta in TripMap (barra e elenco).
// L'attribuzione non è un controllo di MapLibre: la scrive TripMap, una volta sola e per intero.

// Worker servito da public/vendor/maplibre/ (scripts/vendor/copy-maplibre-worker.mjs): il percorso
// relativo che MapLibre calcola da sé non sopravvive al bundler.
setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");

export type MapCanvasState = "ready" | "error";

const ROUTE_LEGS = "route-legs";
const ROUTE_LEGS_ACTIVE = "route-legs-active";
const ROUTE_ARCS = "route-arcs";
const SPIDER = "spider";
const MIN_FLY_ZOOM = 13;

type MarkerEntry = { marker: Marker; el: HTMLDivElement };

export function MapCanvas({
  points,
  legs,
  route,
  activeId,
  fitToken,
  onState,
  onSelect,
}: {
  points: MapPoint[];
  legs: RouteLeg[];
  route: boolean;
  activeId: string | null;
  /** Cambia quando si chiede di vedere tutto il giorno (fitBounds). */
  fitToken: number;
  onState: (state: MapCanvasState) => void;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("Map");
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const arrowsRef = useRef<Marker[]>([]);
  const paletteRef = useRef<MapPalette | null>(null);
  const onStateRef = useRef(onState);
  const onSelectRef = useRef(onSelect);
  const lastFlownRef = useRef<string | null>(null);
  const inputRef = useRef({ points, legs, route, activeId });

  useEffect(() => {
    onStateRef.current = onState;
  }, [onState]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Colori delle tratte dalla palette (quindi dal tema del sottoalbero).
  function applyRouteColors(map: MapLibreMap, palette: MapPalette) {
    if (palette.route) {
      for (const id of [ROUTE_LEGS, ROUTE_ARCS, SPIDER]) {
        if (map.getLayer(id)) map.setPaintProperty(id, "line-color", palette.route);
      }
    }
    if (palette.text && map.getLayer(ROUTE_LEGS_ACTIVE)) map.setPaintProperty(ROUTE_LEGS_ACTIVE, "line-color", palette.text);
  }

  // Stile: colori letti dal contenitore (quindi dal tema del sottoalbero) e applicati a ogni livello.
  function applyTheme(map: MapLibreMap, el: HTMLElement) {
    const computed = getComputedStyle(el);
    const palette = readPalette((token) => computed.getPropertyValue(token));
    paletteRef.current = palette;
    for (const layer of map.getStyle().layers) {
      for (const patch of paletteFor({ id: layer.id, type: layer.type }, palette)) {
        map.setPaintProperty(patch.layerId, patch.property, patch.value);
      }
      if (isHiddenLayer(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
    }
    applyRouteColors(map, palette);
  }

  // Marker spostati dalla raggiera: ogni tappa nello stesso luogo sta su un punto del cerchio attorno
  // al luogo reale, a un raggio in pixel che dipende dallo zoom. Si ricalcola a ogni cambio di zoom.
  function layoutMarkers(map: MapLibreMap) {
    const zoom = map.getZoom();
    const lines: { from: LngLat; to: LngLat }[] = [];
    for (const group of groupBySpot(inputRef.current.points)) {
      const count = group.points.length;
      const offsets = spiderOffsets(count, spiderRadiusPx(count, zoom));
      const center = map.project([group.lng, group.lat]);
      group.points.forEach((point, i) => {
        const entry = markersRef.current.get(point.id);
        if (!entry) return;
        const offset = offsets[i] ?? { x: 0, y: 0 };
        if (offset.x === 0 && offset.y === 0) {
          entry.marker.setLngLat([group.lng, group.lat]);
          return;
        }
        const moved = map.unproject([center.x + offset.x, center.y + offset.y]);
        entry.marker.setLngLat([moved.lng, moved.lat]);
        lines.push({ from: [group.lng, group.lat], to: [moved.lng, moved.lat] });
      });
    }
    const spider = map.getSource<GeoJSONSource>(SPIDER);
    spider?.setData(spiderLinesCollection(lines));
  }

  // Tratte e frecce del percorso: la tratta attiva è quella che tocca la tappa attiva.
  function updateRoute(map: MapLibreMap) {
    const { points: current, legs: knownLegs, route: showRoute, activeId: active } = inputRef.current;
    const segments = showRoute ? routeSegments(current, knownLegs) : [];
    const collections = routeCollections(segments, active);
    const setData = (id: string, data: FeatureCollection<LineString>) => {
      map.getSource<GeoJSONSource>(id)?.setData(data);
    };
    setData(ROUTE_LEGS, {
      type: "FeatureCollection",
      features: collections.legs.features.filter((f) => !f.properties.active),
    });
    setData(ROUTE_LEGS_ACTIVE, {
      type: "FeatureCollection",
      features: collections.legs.features.filter((f) => f.properties.active),
    });
    setData(ROUTE_ARCS, collections.arcs);

    for (const arrow of arrowsRef.current) arrow.remove();
    arrowsRef.current = collections.arrows.map(({ point, bearing }) => {
      const el = document.createElement("div");
      el.className = "is-map__arrow";
      el.setAttribute("aria-hidden", "true");
      el.appendChild(arrowSvg());
      return new Marker({ element: el, anchor: "center", rotation: bearing, rotationAlignment: "map" })
        .setLngLat(point)
        .addTo(map);
    });
  }

  // Marker per tappa, percorso e vista sui punti: alla prima mappa pronta e a ogni cambio di tappe.
  function rebuildPoints(map: MapLibreMap) {
    const { points: current, activeId: active } = inputRef.current;
    for (const entry of markersRef.current.values()) entry.marker.remove();
    markersRef.current = new Map();
    for (const point of current) {
      const el = document.createElement("div");
      const numbered = point.number !== undefined;
      el.className = numbered ? "is-map__marker" : "is-map__marker is-map__marker--dot";
      if (point.visited) el.classList.add("is-map__marker--visited");
      if (point.id === active) el.classList.add("is-map__marker--active");
      el.setAttribute("aria-hidden", "true");
      el.textContent = numbered ? String(point.number) : "";
      el.addEventListener("click", () => onSelectRef.current(point.id));
      const marker = new Marker({ element: el, anchor: "center" }).setLngLat([point.lng, point.lat]).addTo(map);
      markersRef.current.set(point.id, { marker, el });
    }
    layoutMarkers(map);
    updateRoute(map);
  }

  function fitPoints(map: MapLibreMap) {
    const bounds = boundsOf(inputRef.current.points);
    if (!bounds) {
      map.jumpTo({ center: [SICILY_CENTER.lng, SICILY_CENTER.lat], zoom: SICILY_ZOOM });
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.fitBounds([bounds.sw, bounds.ne], {
      padding: FIT_PADDING,
      maxZoom: FIT_MAX_ZOOM,
      animate: !reduced,
    });
  }

  // Cambio di tappa attiva: stato dei marker e della tratta, poi la mappa va sulla tappa.
  function updateActive(map: MapLibreMap) {
    const { points: current, activeId: active } = inputRef.current;
    for (const [id, entry] of markersRef.current) {
      entry.el.classList.toggle("is-map__marker--active", id === active);
    }
    updateRoute(map);
    if (active === lastFlownRef.current) return;
    lastFlownRef.current = active;
    const target = current.find((point) => point.id === active);
    if (!target) return;
    const center: LngLat = [target.lng, target.lat];
    const zoom = Math.max(map.getZoom(), MIN_FLY_ZOOM);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) map.jumpTo({ center, zoom });
    else map.flyTo({ center, zoom });
  }

  useEffect(() => {
    const el = container.current;
    if (!el) return;

    const map = new MapLibreMap({
      container: el,
      style: MAP_STYLE_URL,
      attributionControl: false,
      scrollZoom: false,
      cooperativeGestures: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      locale: {
        "Map.Title": t("canvasTitle"),
        "NavigationControl.ZoomIn": t("zoomIn"),
        "NavigationControl.ZoomOut": t("zoomOut"),
        "CooperativeGesturesHandler.MobileHelpText": t("gestureTouch"),
        "CooperativeGesturesHandler.WindowsHelpText": t("gestureMouse"),
        "CooperativeGesturesHandler.MacHelpText": t("gestureMac"),
      },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), "top-right");

    const onStyleLoad = () => applyTheme(map, el);
    const onLoad = () => {
      loadedRef.current = true;
      const palette = paletteRef.current;
      const lineColor = palette?.route ?? "";
      const lineColorActive = palette?.text ?? "";
      const withColor = (color: string) => (color ? { "line-color": color } : {});
      const empty = emptyCollection<LineString>();
      if (!map.getSource(ROUTE_LEGS)) {
        map.addSource(ROUTE_LEGS, { type: "geojson", data: empty });
        map.addSource(ROUTE_LEGS_ACTIVE, { type: "geojson", data: empty });
        map.addSource(ROUTE_ARCS, { type: "geojson", data: empty });
        map.addSource(SPIDER, { type: "geojson", data: empty });
        // Tratta stradale: linea continua. Tratta attiva: più spessa e nel colore del testo.
        map.addLayer({
          id: ROUTE_LEGS,
          type: "line",
          source: ROUTE_LEGS,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-width": 3, ...withColor(lineColor) },
        });
        map.addLayer({
          id: ROUTE_LEGS_ACTIVE,
          type: "line",
          source: ROUTE_LEGS_ACTIVE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-width": 5, ...withColor(lineColorActive) },
        });
        // Tratta non ancora calcolata: arco tratteggiato. Tratteggio 2px per 6px (manuale).
        map.addLayer({
          id: ROUTE_ARCS,
          type: "line",
          source: ROUTE_ARCS,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-width": 2, "line-dasharray": [1, 3], ...withColor(lineColor) },
        });
        map.addLayer({
          id: SPIDER,
          type: "line",
          source: SPIDER,
          paint: { "line-width": 1, ...withColor(lineColor) },
        });
      }
      lastFlownRef.current = inputRef.current.activeId;
      rebuildPoints(map);
      fitPoints(map);
      onStateRef.current("ready");
    };
    const onError = () => {
      // Errori di tile dopo il caricamento non cambiano lo stato: la mappa resta utilizzabile.
      if (!loadedRef.current) onStateRef.current("error");
    };
    const onZoomEnd = () => {
      if (loadedRef.current) layoutMarkers(map);
    };

    map.on("style.load", onStyleLoad);
    map.on("load", onLoad);
    map.on("error", onError);
    map.on("zoomend", onZoomEnd);

    // Tema chiaro/scuro: cambio dell'attributo data-theme o della preferenza di sistema.
    const observer = new MutationObserver(() => {
      if (mapRef.current && loadedRef.current) applyTheme(map, el);
    });
    observer.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => {
      if (loadedRef.current) applyTheme(map, el);
    };
    media.addEventListener("change", onMedia);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", onMedia);
      for (const entry of markersRef.current.values()) entry.marker.remove();
      for (const arrow of arrowsRef.current) arrow.remove();
      markersRef.current = new Map();
      arrowsRef.current = [];
      mapRef.current = null;
      loadedRef.current = false;
      map.remove();
    };
    // La mappa si crea una volta: punti, percorso e tappa attiva si aggiornano negli effetti sotto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Punti nuovi: marker da rifare e vista sui punti.
  useEffect(() => {
    inputRef.current = { ...inputRef.current, points, legs, route, activeId };
    const map = mapRef.current;
    if (map && loadedRef.current) {
      rebuildPoints(map);
      fitPoints(map);
    }
    // Il riferimento di points cambia solo quando cambia il contenuto (TripMap lo stabilizza).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // Tratte nuove (legs o route): solo il percorso.
  useEffect(() => {
    inputRef.current = { ...inputRef.current, legs, route };
    const map = mapRef.current;
    if (map && loadedRef.current) updateRoute(map);
  }, [legs, route]);

  // Tappa attiva: marker, tratta evidenziata e spostamento della mappa.
  useEffect(() => {
    inputRef.current = { ...inputRef.current, activeId };
    const map = mapRef.current;
    if (map && loadedRef.current) updateActive(map);
    // updateActive legge i punti e la tappa attiva da inputRef: l'effetto gira solo al cambio di tappa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // "Mostra tutto il giorno": fitBounds sui punti.
  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current && fitToken > 0) fitPoints(map);
  }, [fitToken]);

  return <div ref={container} className="is-map__canvas" />;
}

// Freccia di direzione della tratta: un triangolo SVG orientato dal rotation del marker.
function arrowSvg(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 10 10");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M5 0 L10 10 L5 7 L0 10 Z");
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}
