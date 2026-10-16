"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { boundsOf } from "@/lib/geo";
import {
  FIT_MAX_ZOOM,
  FIT_PADDING,
  MAP_STYLE_URL,
  SICILY_CENTER,
  SICILY_ZOOM,
  groupMarkers,
  isHiddenLayer,
  paletteFor,
  readPalette,
  routeGeoJson,
  type MapPalette,
  type MapPoint,
} from "./map-style";

// Canvas della mappa (docs/design/components/Map/README.md). Caricato solo quando il contenitore entra
// nello schermo (TripMap): qui sta il CSS di MapLibre, quindi non entra nel bundle iniziale.
// Stile di OpenFreeMap con i colori dei token; marker numerati come le tappe; linea del percorso
// tratteggiata; nessuna interazione con lo scroll della pagina (zoom con i controlli o con Ctrl/due dita).
// I marker sono nascosti allo screen reader: l'elenco numerato di TripMap dice gli stessi punti.
// L'attribuzione non è un controllo di MapLibre: la scrive TripMap, una volta sola e per intero.

// Worker servito da public/vendor/maplibre/ (scripts/vendor/copy-maplibre-worker.mjs): il percorso
// relativo che MapLibre calcola da sé non sopravvive al bundler.
setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");

export type MapCanvasState = "ready" | "error";

export function MapCanvas({
  points,
  route,
  onState,
}: {
  points: MapPoint[];
  route: boolean;
  onState: (state: MapCanvasState) => void;
}) {
  const t = useTranslations("Map");
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const markersRef = useRef<Marker[]>([]);
  const paletteRef = useRef<MapPalette | null>(null);
  const onStateRef = useRef(onState);
  const inputRef = useRef({ points, route });

  useEffect(() => {
    onStateRef.current = onState;
  }, [onState]);

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
    if (map.getLayer("route")) map.setPaintProperty("route", "line-color", palette.route);
  }

  // Marker e linea del percorso dei punti correnti; poi la vista si adatta ai punti.
  function syncOverlay(map: MapLibreMap) {
    const { points: current, route: showRoute } = inputRef.current;
    for (const marker of markersRef.current) marker.remove();
    // Una tappa per coordinata: più tappe nello stesso luogo sono un solo marker con i numeri uniti.
    markersRef.current = groupMarkers(current).map((group) => {
      const el = document.createElement("div");
      el.className = group.numbered ? "is-map__marker" : "is-map__marker is-map__marker--dot";
      el.setAttribute("aria-hidden", "true");
      el.textContent = group.text;
      return new Marker({ element: el, anchor: "center" }).setLngLat([group.lng, group.lat]).addTo(map);
    });

    const source = map.getSource<GeoJSONSource>("route");
    const lineData = showRoute && current.length > 1 ? routeGeoJson(current) : null;
    if (source) {
      source.setData(lineData ?? { type: "FeatureCollection", features: [] });
    }

    const bounds = boundsOf(current);
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
      if (!map.getSource("route")) {
        const routeColor = paletteRef.current?.route ?? "";
        map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          // Tratteggio 2px per 6px: 1 e 3 volte la larghezza della linea (manuale, linea del percorso).
          paint: { "line-width": 2, "line-dasharray": [1, 3], ...(routeColor ? { "line-color": routeColor } : {}) },
        });
      }
      syncOverlay(map);
      onStateRef.current("ready");
    };
    const onError = () => {
      // Errori di tile dopo il caricamento non cambiano lo stato: la mappa resta utilizzabile.
      if (!loadedRef.current) onStateRef.current("error");
    };

    map.on("style.load", onStyleLoad);
    map.on("load", onLoad);
    map.on("error", onError);

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
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      mapRef.current = null;
      loadedRef.current = false;
      map.remove();
    };
    // La mappa si crea una volta: punti e percorso si aggiornano nel secondo effetto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    inputRef.current = { points, route };
    const map = mapRef.current;
    if (map && loadedRef.current) syncOverlay(map);
  }, [points, route]);

  return <div ref={container} className="is-map__canvas" />;
}
