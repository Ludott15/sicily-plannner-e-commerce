"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DayTabs, ItineraryStop, Route } from "@/components/design";

// Il viaggio condiviso: sola lettura, giorno per giorno con le tappe e le note. Nessun comando
// di modifica: niente trascinamento, niente pulsanti di azione.

export type SharedStopView = {
  key: string;
  time: string | null;
  title: string;
  href: string | null;
  meta: string;
  notes: string | null;
};

export type SharedDayView = { name: string; note: string; stops: SharedStopView[] };

export function SharedTripView({ days }: { days: SharedDayView[] }) {
  const t = useTranslations("Trips");
  const [picked, setPicked] = useState(0);
  const index = Math.min(Math.max(picked, 0), days.length - 1);
  const day = days[index];
  if (!day) return null;

  return (
    <div className="flex flex-col gap-6">
      <DayTabs days={days.map((d) => ({ name: d.name }))} current={index} onSelect={setPicked} />
      <section aria-label={day.name} className="flex flex-col gap-4">
        {day.note && <p className="text-body whitespace-pre-line">{day.note}</p>}
        {day.stops.length === 0 ? (
          <p className="text-body text-lava-muted">{t("sharedEmptyDay")}</p>
        ) : (
          <Route>
            {day.stops.map((stop) => (
              <ItineraryStop
                key={stop.key}
                time={stop.time ?? undefined}
                title={stop.title}
                href={stop.href ?? undefined}
                meta={stop.meta}
              >
                {stop.notes && <p className="mt-2 text-body-s whitespace-pre-line text-lava-muted">{stop.notes}</p>}
              </ItineraryStop>
            ))}
          </Route>
        )}
      </section>
    </div>
  );
}
