"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { MapCanvasState } from "./map-canvas";
import type { MapPoint } from "./map-style";

// TripMap (docs/design/components/Map/README.md)
// Mappa dei punti di un giorno (o di una pagina), con marker numerati come le tappe e la linea del
// percorso. Il canvas (MapLibre) si carica solo quando il contenitore entra nello schermo: finché non
// si vede, non parte nessuna richiesta al provider dei tile. L'altezza è fissa (nessun salto di layout).
// L'attribuzione dei dati è sempre visibile, dentro il riquadro.
// L'elenco numerato dei punti è nel DOM: è il fallback senza JavaScript, per la stampa e per lo screen
// reader. Finché la mappa non è pronta l'elenco copre il riquadro; a mappa pronta resta solo per gli
// screen reader.

export type TripMapProps = {
  points: MapPoint[];
  route?: boolean;
  ariaLabel: string;
  className?: string;
  /** Elenco numerato dei punti. Con false, la mappa non ha un elenco e mostra il caricamento. */
  listed?: boolean;
};

type ShellState = "idle" | "loading" | "ready" | "error";

const MapCanvas = dynamic(() => import("./map-canvas").then((m) => m.MapCanvas), { ssr: false });

// Stessi punti (stesso contenuto) = stesso riferimento: la mappa non si ridisegna a ogni render del genitore.
function useStablePoints(points: MapPoint[]): MapPoint[] {
  const key = points.map((p) => `${p.id}|${p.lat}|${p.lng}|${p.number ?? ""}|${p.label}`).join("\n");
  // La chiave riassume i campi usati da MapCanvas: il riferimento cambia solo quando cambia il contenuto.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => points, [key]);
}

export function TripMap({ points, route = false, ariaLabel, className, listed = true }: TripMapProps) {
  const t = useTranslations("Map");
  const shell = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<ShellState>("idle");
  const stable = useStablePoints(points);

  useEffect(() => {
    const el = shell.current;
    if (!el || visible) return;
    const reveal = () => {
      setVisible(true);
      setState("loading");
    };
    if (typeof IntersectionObserver === "undefined") {
      reveal();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          reveal();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const onCanvasState = useCallback((next: MapCanvasState) => setState(next), []);
  const ready = state === "ready";

  return (
    <section ref={shell} aria-label={ariaLabel} data-state={state} className={cn("is-map", className)}>
      {visible && <MapCanvas points={stable} route={route} onState={onCanvasState} />}
      <div className={cn("is-map__panel", ready && "is-map__panel--ready")}>
        {state === "error" && (
          <p role="status" className="is-map__notice">
            {t("unavailable")}
          </p>
        )}
        {!listed && !ready && state !== "error" && (
          <p role="status" className="is-map__notice">
            {t("loading")}
          </p>
        )}
        {listed && (
          <ol className="is-map__list" aria-label={t("listLabel")}>
            {stable.map((point) => (
              <li key={point.id}>
                {point.number === undefined ? point.label : t("markerLabel", { n: point.number, label: point.label })}
              </li>
            ))}
          </ol>
        )}
      </div>
      {/* Attribuzione dei dati: una sola, per intera, sempre visibile (licenza di OpenFreeMap e OpenMapTiles). */}
      <p className="is-map__credit">{t("attribution")}</p>
    </section>
  );
}
