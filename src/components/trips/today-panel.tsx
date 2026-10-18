"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ButtonAnchor } from "@/components/design";
import type { TimeSlot } from "@/lib/itinerary-checks";
import { mapsLinks } from "@/lib/maps-links";
import { romeToday } from "@/lib/trip-days";
import { tripDayIndex } from "@/lib/trip-today";
import { CheckInButton } from "./check-in-button";

// "Oggi" in cima all'itinerario (passo 11.3): le tappe del giorno in corso, con i link alle mappe
// (solo se la tappa ha le coordinate) e il check-in "Sono qui" già esistente (passo 5.1).
// Il giorno lo sceglie il browser, con la data di oggi in Europe/Rome: così funziona anche offline e
// con la pagina salvata. Il primo render (server e idratazione) usa initialDayIndex; se la data del
// browser è diversa, il componente si aggiorna dopo l'idratazione, senza errori di disallineamento.

export type TodayStop = {
  id: string;
  dayIndex: number;
  position: number;
  title: string;
  placeName: string | null;
  timeSlot: TimeSlot | null;
  lat: number | null;
  lng: number | null;
  checkIn: { checkedInToday: boolean } | null;
};

type Props = {
  startDate: string | null;
  days: number;
  /** Indice del giorno calcolato dal server per il primo render (null se oggi non cade nel viaggio). */
  initialDayIndex: number | null;
  stops: TodayStop[];
};

// Nessun evento da ascoltare: la data del browser si legge al render.
function subscribeNothing(): () => void {
  return () => {};
}

export function TodayPanel({ startDate, days, initialDayIndex, stops }: Props) {
  const t = useTranslations("Pwa");
  const tTrips = useTranslations("Trips");
  const dayIndex = useSyncExternalStore(
    subscribeNothing,
    () => tripDayIndex(startDate, days, romeToday(new Date())),
    () => initialDayIndex,
  );

  if (dayIndex === null) return null;

  const dayStops = stops
    .filter((stop) => stop.dayIndex === dayIndex)
    .sort((a, b) => a.position - b.position);

  return (
    <section aria-labelledby="today-title" className="flex flex-col gap-4 rounded-lg border border-divider bg-calce-raised p-5 md:p-6">
      <h2 id="today-title" className="text-heading-3">
        {t("todayTitle", { n: dayIndex + 1 })}
      </h2>
      {dayStops.length === 0 ? (
        <p className="text-body text-lava-muted">{t("todayEmpty")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-divider">
          {dayStops.map((stop) => {
            const links = mapsLinks(stop.lat, stop.lng, stop.title);
            const details = [stop.placeName, stop.timeSlot ? tTrips(`timeSlot.${stop.timeSlot}`) : null].filter(Boolean);
            return (
              <li key={stop.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-1">
                  <p className="text-body-l font-semibold">{stop.title}</p>
                  {details.length > 0 && <p className="text-body-s text-lava-muted">{details.join(" · ")}</p>}
                </div>
                {links && (
                  <div className="flex flex-wrap gap-2">
                    <ButtonAnchor variant="secondary" size="sm" href={links.google} target="_blank" rel="noopener noreferrer">
                      {t("mapsGoogle")}
                    </ButtonAnchor>
                    <ButtonAnchor variant="secondary" size="sm" href={links.apple} target="_blank" rel="noopener noreferrer">
                      {t("mapsApple")}
                    </ButtonAnchor>
                  </div>
                )}
                {stop.checkIn && <CheckInButton itemId={stop.id} checkedInToday={stop.checkIn.checkedInToday} />}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
