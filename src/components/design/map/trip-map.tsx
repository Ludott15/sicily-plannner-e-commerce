"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatDistance, formatDuration, type RouteLeg } from "@/lib/maps/legs";
import type { MapCanvasState } from "./map-canvas";
import { routeSegments, type MapPoint } from "./map-style";

// TripMap (docs/design/components/Map/README.md)
// Mappa dei punti di un giorno (o di una pagina): ogni tappa ha il suo marker numerato; le tappe nello
// stesso luogo si dispongono a raggiera. Con route, il percorso segue la strada (legs) o, se la tratta
// non è ancora calcolata, un arco tratteggiato. Con route e più di un punto, una barra di navigazione:
// tappa precedente e successiva, "Tappa n di N · nome", tempo e distanza verso la successiva.
// Il canvas (MapLibre) si carica solo quando il contenitore entra nello schermo: finché non si vede,
// non parte nessuna richiesta al provider dei tile. L'altezza è fissa (nessun salto di layout).
// L'elenco numerato dei punti è nel DOM: è il fallback senza JavaScript, per la stampa e per lo screen
// reader. Finché la mappa non è pronta l'elenco copre il riquadro; a mappa pronta resta solo per gli
// screen reader.
// La tappa attiva può essere controllata dal genitore (activeId + onActiveChange), così la lista delle
// tappe e la mappa restano allineate; senza, la gestisce il componente.

export type TripMapProps = {
  points: MapPoint[];
  /** Tratte stradali tra le tappe consecutive (place_legs). Usate solo con route. */
  legs?: RouteLeg[];
  route?: boolean;
  ariaLabel: string;
  className?: string;
  /** Elenco numerato dei punti. Con false, la mappa non ha un elenco e mostra il caricamento. */
  listed?: boolean;
  /** Tappa attiva (controllata). Senza, la mappa tiene la sua. */
  activeId?: string | null;
  onActiveChange?: (id: string) => void;
};

type ShellState = "idle" | "loading" | "ready" | "error";

const NO_LEGS: RouteLeg[] = [];

const MapCanvas = dynamic(() => import("./map-canvas").then((m) => m.MapCanvas), { ssr: false });

// Stessi punti (stesso contenuto) = stesso riferimento: la mappa non si ridisegna a ogni render del genitore.
function useStablePoints(points: MapPoint[]): MapPoint[] {
  const key = points
    .map((p) => `${p.id}|${p.lat}|${p.lng}|${p.number ?? ""}|${p.label}|${p.placeId ?? ""}|${p.visited ? 1 : 0}`)
    .join("\n");
  // La chiave riassume i campi usati dalla mappa: il riferimento cambia solo quando cambia il contenuto.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => points, [key]);
}

// FNV-1a a 32 bit: firma breve delle coordinate, così la chiave cambia quando cambia il percorso.
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function useStableLegs(legs: RouteLeg[]): RouteLeg[] {
  const key = legs
    .map((l) => {
      const shape = l.coordinates.map((c) => `${c[0]},${c[1]}`).join(";");
      return `${l.fromPlaceId}>${l.toPlaceId}:${l.distanceM}:${l.durationS}:${fnv1a(shape)}`;
    })
    .join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => legs, [key]);
}

export function TripMap({
  points,
  legs = NO_LEGS,
  route = false,
  ariaLabel,
  className,
  listed = true,
  activeId,
  onActiveChange,
}: TripMapProps) {
  const t = useTranslations("Map");
  const locale = useLocale() === "en" ? "en" : "it";
  const shell = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<ShellState>("idle");
  const [ownActive, setOwnActive] = useState<string | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const stable = useStablePoints(points);
  const stableLegs = useStableLegs(legs);

  // Tappa attiva: quella data dal genitore, o quella della mappa; se non c'è, la prima.
  const requested = activeId ?? ownActive;
  const index = Math.max(0, stable.findIndex((p) => p.id === requested));
  const current = stable[index] ?? null;

  const select = useCallback(
    (id: string) => {
      if (activeId === undefined) setOwnActive(id);
      onActiveChange?.(id);
    },
    [activeId, onActiveChange],
  );

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

  // Tratte tra le tappe: segments[i] è la tratta dalla tappa i alla i+1.
  const segments = route ? routeSegments(stable, stableLegs) : [];
  const pending = segments.some((segment) => segment.kind === "arc");
  const next = stable[index + 1];
  const segment = route && next ? segments[index] : undefined;
  const eta =
    segment === undefined
      ? null
      : segment.kind === "leg" && segment.leg
        ? t("routeEta", {
            duration: formatDuration(segment.leg.durationS, locale),
            distance: formatDistance(segment.leg.distanceM, locale),
          })
        : segment.kind === "same"
          ? t("sameSpot")
          : t("routePending");

  // Ai bordi il pulsante dell'estremo si disabilita: il focus passa all'altro pulsante.
  const prevButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<"prev" | "next" | null>(null);

  useEffect(() => {
    const which = focusAfter.current;
    if (!which) return;
    focusAfter.current = null;
    (which === "prev" ? prevButton : nextButton).current?.focus();
  }, [index]);

  const go = (delta: -1 | 1) => {
    const target = stable[index + delta];
    if (!target) return;
    const atEdge = delta === -1 ? index - 1 === 0 : index + 1 === stable.length - 1;
    focusAfter.current = atEdge ? (delta === -1 ? "next" : "prev") : null;
    select(target.id);
  };

  const onNavKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    }
  };

  const showNav = route && stable.length > 1 && current !== null;

  return (
    <section aria-label={ariaLabel} data-state={state} className={cn("is-map-section", className)}>
      <div ref={shell} className="is-map">
        {visible && (
          <MapCanvas
            points={stable}
            legs={stableLegs}
            route={route}
            activeId={current?.id ?? null}
            fitToken={fitToken}
            onState={onCanvasState}
            onSelect={select}
          />
        )}
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
      </div>

      {showNav && current && (
        <div className="is-map-nav" role="group" aria-label={t("navLabel")} tabIndex={0} onKeyDown={onNavKey}>
          <div className="is-map-nav__row">
            <button ref={prevButton} type="button" className="is-map-nav__btn" onClick={() => go(-1)} disabled={index === 0}>
              <span aria-hidden="true">‹ </span>
              {t("prevStop")}
            </button>
            <p className="is-map-nav__current" aria-live="polite">
              {t("stopOf", { n: index + 1, total: stable.length, name: current.label })}
            </p>
            <button ref={nextButton} type="button" className="is-map-nav__btn" onClick={() => go(1)} disabled={index >= stable.length - 1}>
              {t("nextStop")}
              <span aria-hidden="true"> ›</span>
            </button>
          </div>
          <div className="is-map-nav__row is-map-nav__row--sub">
            {eta && next && <p className="is-map-nav__eta">{eta}</p>}
            <button type="button" className="is-map-nav__all" onClick={() => setFitToken((value) => value + 1)}>
              {t("showAll")}
            </button>
          </div>
          {pending && <p className="is-map__legend">{t("legendPending")}</p>}
        </div>
      )}
    </section>
  );
}
