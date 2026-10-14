import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { requireUser } from "@/server/auth";
import { listMyTrips } from "@/server/trips/queries";

// I miei viaggi (M5, 1.4): due sezioni, "In arrivo" (senza data o non ancora finiti, per data di
// partenza crescente) e "Passati" (finiti, dal più recente). Pagina personale.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Trips" });
  return { title: t("listTitle"), robots: { index: false, follow: false } };
}

export default async function TripsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [{ upcoming, past }, t, format] = await Promise.all([listMyTrips(user), getTranslations("Trips"), getFormatter()]);

  const row = (trip: (typeof upcoming)[number]) => (
    <li key={trip.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-divider py-4">
      <Link href={`/viaggi/${trip.id}`} className="text-body-l font-semibold">
        {trip.title}
      </Link>
      <span className="text-body-s text-lava-muted">
        {[
          trip.startDate ? format.dateTime(new Date(`${trip.startDate}T12:00:00`), { dateStyle: "medium" }) : t("noDates"),
          t("daysCount", { count: trip.days }),
          t("stopsCount", { count: trip.stops }),
        ].join(" · ")}
      </span>
    </li>
  );

  const empty = upcoming.length === 0 && past.length === 0;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="is-display text-display-l">{t("listTitle")}</h1>
        <ButtonLink href="/viaggio/nuovo" variant="primary">
          {t("createTrip")}
        </ButtonLink>
      </div>

      {empty ? (
        <p className="text-body-l text-lava-muted">{t("listEmpty")}</p>
      ) : (
        <>
          <section aria-labelledby="trips-upcoming" className="flex flex-col gap-3">
            <h2 id="trips-upcoming" className="text-heading-3">
              {t("upcomingTitle")}
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-body text-lava-muted">{t("upcomingEmpty")}</p>
            ) : (
              <ul className="flex flex-col">{upcoming.map(row)}</ul>
            )}
          </section>
          <section aria-labelledby="trips-past" className="flex flex-col gap-3">
            <h2 id="trips-past" className="text-heading-3">
              {t("pastTitle")}
            </h2>
            {past.length === 0 ? (
              <p className="text-body text-lava-muted">{t("pastEmpty")}</p>
            ) : (
              <ul className="flex flex-col">{past.map(row)}</ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
