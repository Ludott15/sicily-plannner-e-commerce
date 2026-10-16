import type { Metadata } from "next";
import { headers } from "next/headers";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { Link } from "@/lib/i18n/navigation";
import { detectInAppBrowser } from "@/lib/in-app-browser";
import { requireUser } from "@/server/auth";
import { listMyTrips } from "@/server/trips/queries";

// I miei viaggi (M5, 1.4): due sezioni, "In arrivo" (senza data o non ancora finiti, per data di
// partenza crescente) e "Passati" (finiti, dal più recente). Pagina personale: intestazione di pagina
// con l'azione primaria "Crea il tuo viaggio", contenuto nella larghezza di testo.
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
  const [{ upcoming, past }, t, format, requestHeaders] = await Promise.all([
    listMyTrips(user),
    getTranslations("Trips"),
    getFormatter(),
    headers(),
  ]);
  // Invito all'installazione (passo 11.3): solo con almeno due viaggi e fuori dai browser delle app social.
  const inApp = detectInAppBrowser(requestHeaders.get("user-agent")) !== null;

  const row = (trip: (typeof upcoming)[number]) => (
    <li key={trip.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4">
      <Link href={`/viaggi/${trip.id}`} className="text-body-l font-semibold no-underline hover:underline underline-offset-4">
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
    <PageContainer>
      <PageHeader
        title={t("listTitle")}
        primaryAction={
          <ButtonLink href="/viaggio/nuovo" variant="primary">
            {t("createTrip")}
          </ButtonLink>
        }
      />

      <InstallPrompt trips={upcoming.length + past.length} inApp={inApp} />

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
              <ul className="flex flex-col divide-y divide-divider">{upcoming.map(row)}</ul>
            )}
          </section>
          <section aria-labelledby="trips-past" className="flex flex-col gap-3">
            <h2 id="trips-past" className="text-heading-3">
              {t("pastTitle")}
            </h2>
            {past.length === 0 ? (
              <p className="text-body text-lava-muted">{t("pastEmpty")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-divider">{past.map(row)}</ul>
            )}
          </section>
        </>
      )}
    </PageContainer>
  );
}
