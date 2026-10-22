"use client";

import { Fragment, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CatalogLocalTip } from "@/components/catalog/catalog-local-tip";
import { Button, DayTabs, ItineraryStop, Route, TripMap } from "@/components/design";
import type { MapPoint } from "@/components/design/map/map-style";
import { formatDuration } from "@/lib/format";
import type { RouteLeg } from "@/lib/maps/legs";
import { cn } from "@/lib/utils";
import type { PublicTip } from "@/server/catalog/tips";

// Giorni di un itinerario pronto: DayTabs e, per ogni giorno, intro, tappe sulla linea del
// percorso (con fascia oraria, nota e foto) e la notte dopo il giorno. Tutti i giorni restano nel
// DOM: si nasconde quello non scelto, e in stampa (isula.css, @media print) li escono tutti.
// La linea si disegna solo alla prima apertura (movimento.md). Accanto, su desktop, il riepilogo
// del giorno con dati veri (numero di tappe e durata delle attività). La mappa del giorno (6.2): su
// mobile un <details> chiuso sotto le pillole, su desktop nella colonna laterale; in stampa, l'elenco.

export type DayStop = {
  id: string;
  time: string | null;
  title: string;
  href: string | null;
  meta: string | null;
  note: string | null;
  thumbUrl: string | null;
  durationMin: number | null;
  // Coordinate del luogo della tappa: senza, la tappa non ha un punto sulla mappa.
  lat: number | null;
  lng: number | null;
  // Luogo della tappa: con due luoghi consecutivi cerca la tratta stradale (place_legs).
  placeId: string | null;
  // Consiglio locale da mostrare accanto alla tappa (al massimo uno per giorno).
  tip?: PublicTip | null;
};

export type Day = {
  name: string;
  intro: string | null;
  // Dove si dorme la notte dopo questo giorno (null se non c'è una scelta o è l'ultimo giorno).
  night: string | null;
  stops: DayStop[];
  // Tratte stradali delle sole coppie di tappe consecutive di questo giorno (place_legs).
  legs: RouteLeg[];
};

export function ItineraryDays({ days }: { days: Day[] }) {
  const t = useTranslations("Catalog");
  const locale = useLocale();
  const [current, setCurrent] = useState(0);
  const [firstOpen, setFirstOpen] = useState(true);
  // Tappa attiva sulla mappa: la condividono la mappa e l'elenco (la scheda si evidenzia).
  const [activeStop, setActiveStop] = useState<string | null>(null);
  // Giorno con il <details> della mappa aperto (solo mobile; su desktop la mappa è sempre in colonna).
  const [mapOpenDay, setMapOpenDay] = useState<number | null>(null);
  const tMap = useTranslations("Map");

  return (
    <div className="flex flex-col gap-6">
      <DayTabs
        days={days.map((d) => ({ name: d.name }))}
        current={current}
        onSelect={(i) => {
          setFirstOpen(false);
          setActiveStop(null);
          setCurrent(i);
        }}
      />
      {days.map((day, index) => {
        const minutes = day.stops.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
        // Punti della mappa: tappe con coordinate, numerate come nell'elenco del giorno.
        const points: MapPoint[] = day.stops.flatMap((stop, i) =>
          stop.lat === null || stop.lng === null
            ? []
            : [{ id: stop.id, lat: stop.lat, lng: stop.lng, label: stop.title, number: i + 1, placeId: stop.placeId }],
        );
        const mapLabel = tMap("dayMap", { n: index + 1 });
        return (
          <div
            key={index}
            data-day-panel
            className={cn("grid gap-10 md:grid-cols-12 md:gap-12", index !== current && "hidden")}
          >
            <div className="flex min-w-0 flex-col gap-8 md:col-span-8">
              {points.length > 0 && (
                <details
                  className="is-map-details is-map-printable md:hidden"
                  open={mapOpenDay === index}
                  onToggle={(event) => {
                    const open = event.currentTarget.open;
                    // Chiusura di un giorno che non è più quello aperto: non tocca l'apertura attuale.
                    setMapOpenDay((prev) => (open ? index : prev === index ? null : prev));
                  }}
                >
                  <summary>{tMap("showMap")}</summary>
                  <TripMap
                    points={points}
                    legs={day.legs}
                    route
                    ariaLabel={mapLabel}
                    activeId={activeStop}
                    onActiveChange={setActiveStop}
                  />
                </details>
              )}
              {day.intro && <p className="text-body-l">{day.intro}</p>}
              {day.stops.length === 0 ? (
                <p className="text-body text-lava-muted">{t("dayNoStops")}</p>
              ) : (
                <Route draw={firstOpen && index === current}>
                  {day.stops.map((stop) => (
                    <Fragment key={stop.id}>
                      <ItineraryStop
                        time={stop.time ?? undefined}
                        title={stop.title}
                        href={stop.href ?? undefined}
                        meta={stop.meta ?? undefined}
                        thumbUrl={stop.thumbUrl}
                        active={stop.id === activeStop}
                      >
                        {stop.note && <p className="text-body text-lava">{stop.note}</p>}
                        {stop.lat !== null && stop.lng !== null && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                              setActiveStop(stop.id);
                              setMapOpenDay(index);
                            }}
                          >
                            {tMap("showOnMap")}
                          </Button>
                        )}
                      </ItineraryStop>
                      {stop.tip && (
                        // Accanto alla tappa, nella colonna del contenuto: sulla linea del percorso
                        // nessun punto, la linea prosegue.
                        <li className="is-stop">
                          <div />
                          <div />
                          <div className="mb-4">
                            <CatalogLocalTip tip={stop.tip} locale={locale} showPlace />
                          </div>
                        </li>
                      )}
                    </Fragment>
                  ))}
                </Route>
              )}
              {day.night && (
                <div className="flex flex-col gap-2 border-t border-divider pt-6">
                  <p className="text-label uppercase text-lava-muted">{t("sleepWhere")}</p>
                  <p className="text-body-l">{day.night}</p>
                </div>
              )}
            </div>
            <aside className="hidden md:col-span-4 md:block">
              <div className="sticky top-6 flex flex-col gap-6 border-l border-divider pl-8">
                {points.length > 0 && (
                  <div className="is-map-desktop">
                    <TripMap
                      points={points}
                      legs={day.legs}
                      route
                      ariaLabel={mapLabel}
                      activeId={activeStop}
                      onActiveChange={setActiveStop}
                    />
                  </div>
                )}
                <h2 className="text-heading-3">{t("dayInBrief")}</h2>
                <dl className="grid grid-cols-2 gap-6">
                  <div>
                    <dt className="sr-only">{t("stops", { count: day.stops.length })}</dt>
                    <dd className="is-display text-stat">{day.stops.length}</dd>
                    <dd className="text-body-s text-lava-muted">{t("stopsLabel", { count: day.stops.length })}</dd>
                  </div>
                  {minutes > 0 && (
                    <div>
                      <dt className="sr-only">{t("activityTime", { duration: formatDuration(minutes) })}</dt>
                      <dd className="is-display text-stat">{formatDuration(minutes)}</dd>
                      <dd className="text-body-s text-lava-muted">{t("activityTimeLabel")}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </aside>
          </div>
        );
      })}
    </div>
  );
}
