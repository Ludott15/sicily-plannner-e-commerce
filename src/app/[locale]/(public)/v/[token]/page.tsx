import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { SharedTripView, type SharedDayView } from "@/components/trips/shared-trip-view";
import { getSharedTrip } from "@/server/trips/queries";

// Viaggio condiviso con un link (1.4): sola lettura, nessun dato del proprietario. Il token non
// valido o revocato dà 404. Non si indicizza: robots noindex/nofollow (e X-Robots-Tag dal proxy).
type Props = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const trip = await getSharedTrip(token);
  return { title: trip?.title, robots: { index: false, follow: false } };
}

export default async function SharedTripPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const trip = await getSharedTrip(token);
  if (!trip) notFound();

  const [t, format] = await Promise.all([getTranslations("Trips"), getFormatter()]);

  const days: SharedDayView[] = Array.from({ length: trip.days }, (_, d) => {
    const stops = trip.stops.filter((s) => s.dayIndex === d);
    const places = [...new Set(stops.flatMap((s) => (s.placeName ? [s.placeName] : [])))];
    return {
      name: trip.dayTitles[d]?.trim() || places.join(" e ") || t("dayEmptyName"),
      note: trip.dayNotes[d]?.trim() ?? "",
      stops: stops.map((s) => ({
        key: `${s.dayIndex}-${s.position}`,
        time: s.timeSlot ? t(`timeSlot.${s.timeSlot}`) : null,
        title: s.title ?? s.placeName ?? "",
        href: s.activitySlug ? `/attivita/${s.activitySlug}` : null,
        meta: s.placeName ?? "",
        notes: s.notes,
      })),
    };
  });

  const meta = [
    trip.startDate ? t("from", { date: format.dateTime(new Date(`${trip.startDate}T12:00:00`), { dateStyle: "long" }) }) : t("noDates"),
    trip.travelers ? t("travelersOption", { count: trip.travelers }) : null,
    t("daysCount", { count: trip.days }),
  ].filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 py-8 md:px-16 md:py-12">
      <section className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="text-label uppercase text-lava-muted">{t("sharedEyebrow")}</p>
          <h1 className="is-display text-display-l">{trip.title}</h1>
          <p className="text-body text-lava-muted">{meta.join(" · ")}</p>
          <p className="text-body-s text-lava-muted">{t("sharedReadOnly")}</p>
        </header>
        <SharedTripView days={days} />
      </section>

      <section aria-labelledby="shared-invite-title" className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-6 shadow-card">
        <h2 id="shared-invite-title" className="text-heading-3">
          {t("inviteTitle")}
        </h2>
        <p className="text-body text-lava-muted">{t("inviteBody")}</p>
        <div>
          <ButtonLink href="/viaggio/nuovo" variant="primary">
            {t("createTrip")}
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
