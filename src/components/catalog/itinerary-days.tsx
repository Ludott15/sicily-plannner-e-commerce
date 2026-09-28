"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DayTabs, ItineraryStop, Route } from "@/components/design";
import { formatDuration } from "@/lib/format";

// Giorni di un itinerario pronto: DayTabs e, per il giorno scelto, le tappe sulla linea del
// percorso. La linea si disegna solo alla prima apertura (movimento.md); al cambio di giorno
// compare già disegnata. Accanto, su desktop, il riepilogo del giorno con dati veri
// (numero di tappe e durata delle attività): distanze e tempi di guida arrivano con le mappe.

export type DayStop = {
  id: string;
  time: string | null;
  title: string;
  href: string | null;
  meta: string | null;
  durationMin: number | null;
};

export type Day = { name: string; stops: DayStop[] };

export function ItineraryDays({ days }: { days: Day[] }) {
  const t = useTranslations("Catalog");
  const [current, setCurrent] = useState(0);
  const [firstOpen, setFirstOpen] = useState(true);
  const day = days[current]!;
  const minutes = day.stops.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <DayTabs
        days={days.map((d) => ({ name: d.name }))}
        current={current}
        onSelect={(i) => {
          setFirstOpen(false);
          setCurrent(i);
        }}
      />
      <div className="grid gap-10 md:grid-cols-12 md:gap-12">
        <div className="md:col-span-8">
          <Route key={current} draw={firstOpen}>
            {day.stops.map((stop) => (
              <ItineraryStop
                key={stop.id}
                time={stop.time ?? undefined}
                title={stop.title}
                href={stop.href ?? undefined}
                meta={stop.meta ?? undefined}
              />
            ))}
          </Route>
        </div>
        <aside className="hidden md:col-span-4 md:block">
          <div className="sticky top-6 rounded-lg border border-card-edge bg-calce-raised p-6 shadow-card">
            <h2 className="text-heading-3">{t("dayInBrief")}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4">
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
    </div>
  );
}
