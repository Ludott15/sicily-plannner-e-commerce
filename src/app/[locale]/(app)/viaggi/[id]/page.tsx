import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { TripBuilder, type BuilderBooking } from "@/components/trips/trip-builder";
import { formatDuration } from "@/lib/format";
import { bookingEntries } from "@/lib/trips";
import { partnerName, type Partner } from "@/server/affiliates/links";
import { requireUser } from "@/server/auth";
import { getTrip } from "@/server/trips/queries";

// Pagina del viaggio (M5). Solo il proprietario o i membri del gruppo la aprono: getTrip legge
// con dbAsUser, quindi per chiunque altro l'itinerario non esiste (404). Il nome di un giorno è
// il titolo ereditato o scelto; senza titolo, i luoghi delle sue tappe.
type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ giorno?: string }> };

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TripPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const [trip, t, format, { giorno }] = await Promise.all([getTrip(user, id), getTranslations("Trips"), getFormatter(), searchParams]);
  if (!trip) notFound();

  const days = Array.from({ length: trip.days }, (_, d) => {
    const stops = trip.stops.filter((s) => s.dayIndex === d);
    const places = [...new Set(stops.flatMap((s) => (s.placeName ? [s.placeName] : [])))];
    return {
      name: trip.dayTitles[d]?.trim() || places.join(" e ") || t("dayEmptyName"),
      stops: stops.map((s) => ({
        id: s.id,
        title: s.title,
        href: s.activitySlug ? `/attivita/${s.activitySlug}` : null,
        meta: [s.placeName, s.durationMin ? formatDuration(s.durationMin) : null].filter(Boolean).join(" · "),
      })),
    };
  });

  const bookings: BuilderBooking[] = bookingEntries(
    trip.stops,
    trip.offers.map((o) => ({ activityId: o.activityId, partner: o.partner })),
    trip.bookings,
  ).map((e) => ({
    id: e.key,
    kind: e.kind,
    activityId: e.activityId,
    name: e.kind === "activity" ? e.title! : t(`booking.${e.kind}`),
    partner: e.partner ? partnerName(e.partner as Partner) : null,
    // I link ai partner arrivano con la M6: fino ad allora l'azione è in sospeso.
    href: null,
    done: e.done,
  }));

  const meta = [
    trip.startDate ? t("from", { date: format.dateTime(new Date(`${trip.startDate}T12:00:00`), { dateStyle: "long" }) }) : t("noDates"),
    trip.travelers ? t("travelersOption", { count: trip.travelers }) : null,
    t("daysCount", { count: trip.days }),
  ].filter(Boolean);

  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-8 md:px-16 md:py-12">
      <header className="flex flex-col gap-2">
        <p className="text-label uppercase text-lava-muted">{t("eyebrow")}</p>
        <h1 className="is-display text-display-l">{trip.title}</h1>
        <p className="text-body text-lava-muted">{meta.join(" · ")}</p>
      </header>
      <TripBuilder itineraryId={trip.id} days={days} initialDay={(Number(giorno) || 1) - 1} bookings={bookings} />
    </section>
  );
}
