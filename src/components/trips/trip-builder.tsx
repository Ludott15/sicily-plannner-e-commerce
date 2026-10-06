"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { BookingList, DayTabs, ItineraryStop, Route, type BookingItem } from "@/components/design";
import { useRouter } from "@/lib/i18n/navigation";
import { moveStop, removeStop, setBookingDone } from "@/server/trips/actions";

// Builder del viaggio (M5; mockup Itinerario.html e ItinerarioMobile.html senza le parti di
// gruppo): DayTabs, linea del percorso con le tappe del giorno, riordino con su e giù,
// rimozione, checklist "Da prenotare". Le modifiche passano dalle azioni server, poi la
// pagina si aggiorna dai dati salvati.

export type BuilderStop = {
  id: string;
  title: string;
  href: string | null;
  meta: string;
};

export type BuilderBooking = BookingItem & { kind: "activity" | "lodging" | "car" | "flight"; activityId: string | null };

export function TripBuilder({
  itineraryId,
  days,
  initialDay,
  bookings,
}: {
  itineraryId: string;
  days: { name: string; stops: BuilderStop[] }[];
  initialDay: number;
  bookings: BuilderBooking[];
}) {
  const t = useTranslations("Trips");
  const router = useRouter();
  const [day, setDay] = useState(Math.min(Math.max(initialDay, 0), days.length - 1));
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = days[day]!;

  function run(action: () => Promise<{ status: string } | undefined>) {
    setError(false);
    startTransition(async () => {
      const result = await action();
      if (result?.status === "error") setError(true);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        <DayTabs days={days.map((d) => ({ name: d.name }))} current={day} onSelect={setDay} />
        {error && (
          <p role="alert" className="text-body-s text-danger">
            {t("errors.failed")}
          </p>
        )}
        {current.stops.length === 0 ? (
          <p className="text-body text-lava-muted">{t("emptyDay")}</p>
        ) : (
          <Route>
            {current.stops.map((stop, i) => (
              <ItineraryStop key={stop.id} title={stop.title} href={stop.href ?? undefined} meta={stop.meta}>
                <div className="mt-2 flex flex-wrap gap-1" aria-busy={pending}>
                  <button
                    type="button"
                    className="inline-flex size-11 items-center justify-center rounded-md text-lava hover:bg-calce-sunk disabled:opacity-40"
                    aria-label={t("moveUp", { title: stop.title })}
                    disabled={pending || i === 0}
                    onClick={() => run(() => moveStop({ itineraryId, itemId: stop.id, direction: "up" }))}
                  >
                    <ArrowUp size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-11 items-center justify-center rounded-md text-lava hover:bg-calce-sunk disabled:opacity-40"
                    aria-label={t("moveDown", { title: stop.title })}
                    disabled={pending || i === current.stops.length - 1}
                    onClick={() => run(() => moveStop({ itineraryId, itemId: stop.id, direction: "down" }))}
                  >
                    <ArrowDown size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-11 items-center justify-center rounded-md text-lava hover:bg-calce-sunk disabled:opacity-40"
                    aria-label={t("remove", { title: stop.title })}
                    disabled={pending}
                    onClick={() => run(() => removeStop({ itineraryId, itemId: stop.id }))}
                  >
                    <X size={20} aria-hidden="true" />
                  </button>
                </div>
              </ItineraryStop>
            ))}
          </Route>
        )}
      </div>
      <aside className="rounded-lg border border-card-edge bg-calce-raised p-4 lg:self-start">
        <BookingList
          items={bookings}
          onDoneChange={(id, done) => {
            const item = bookings.find((b) => b.id === id)!;
            run(() => setBookingDone({ itineraryId, kind: item.kind, activityId: item.activityId, done }));
          }}
        />
      </aside>
    </div>
  );
}
