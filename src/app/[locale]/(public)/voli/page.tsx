import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FlightCalendar, FlightResults } from "@/components/flights/flight-results";
import { FlightSearch } from "@/components/flights/flight-search";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { CONSENT_COOKIE, hasAnalyticsConsent, parseConsent } from "@/lib/consent";
import { isSicilyAirport, type SicilyAirportCode } from "@/lib/flights/airports";
import { getDeparture } from "@/lib/flights/departures";
import { type CalendarDay } from "@/lib/flights/offers";
import { parseFlightSearchParams, type RawSearchParams } from "@/lib/flights/search-params";
import { canonicalFor } from "@/lib/seo";
import { recordFlightSearch } from "@/server/flights/events";
import { monthCalendar, searchFlights, type SearchOutcome } from "@/server/flights/search";
import { getUser } from "@/server/auth";
import { getSavedPreferences } from "@/server/personalization/data";

// /voli (passo 2.1): ricerca completa dei voli verso la Sicilia. Lo stato sta nell'URL
// (src/lib/flights/search-params.ts): con partenza e data la pagina cerca i prezzi sul server
// e mostra i risultati e il calendario del mese. Senza ricerca mostra solo il modulo. La
// ricerca con parametri non si indicizza. Arrivo predefinito: quello del profilo, altrimenti CTA.

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<RawSearchParams> };

const DEFAULT_ARRIVAL: SicilyAirportCode = "CTA";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const t = await getTranslations({ locale, namespace: "Flights" });
  const searched = Object.keys(query).length > 0;
  return {
    title: t("title"),
    description: t("description"),
    alternates: canonicalFor(locale, "/voli"),
    robots: searched ? { index: false, follow: true } : undefined,
  };
}

export default async function FlightsPage({ params, searchParams }: Props) {
  const [{ locale }, raw] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const query = parseFlightSearchParams(raw);
  const avviso = typeof raw.avviso === "string" ? raw.avviso : null;
  const t = await getTranslations("Flights");
  const tVert = await getTranslations("Verticals");

  const user = await getUser();
  const saved = user ? await getSavedPreferences(user) : null;
  const preferredArrival = saved?.airport && isSicilyAirport(saved.airport) ? saved.airport : null;
  const destination: SicilyAirportCode = query.destination ?? preferredArrival ?? DEFAULT_ARRIVAL;

  const origin = query.origin !== null && getDeparture(query.origin) !== null ? query.origin : null;
  const consented = hasAnalyticsConsent(parseConsent((await cookies()).get(CONSENT_COOKIE)?.value));

  let outcome: SearchOutcome | null = null;
  let calendar: CalendarDay[] | null = null;
  const month = query.departure?.slice(0, 7) ?? null;
  if (origin !== null && query.departure !== null && month !== null) {
    const [result, days] = await Promise.all([
      searchFlights({ origin, destinations: [destination], departure: query.departure, returnDate: query.returnDate }),
      monthCalendar({ origin, destination, month }),
    ]);
    outcome = result;
    calendar = days;
    await recordFlightSearch({ user, consented, itineraryId: query.itineraryId });
  }

  return (
    <PageContainer width="work">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} subtitle={t("intro")} />

      {avviso === "non-disponibile" && (
        <p role="alert" className="rounded-lg border border-card-edge bg-calce-raised p-4 text-body">
          {t("linkUnavailable")}
        </p>
      )}

      {avviso === "troppi-click" && (
        <p role="alert" className="rounded-lg border border-card-edge bg-calce-raised p-4 text-body">
          {tVert("rateLimited")}
        </p>
      )}

      <FlightSearch
        variant="full"
        initial={{
          origin: origin === null ? null : getDeparture(origin),
          destination,
          departure: query.departure,
          returnDate: query.returnDate,
          passengers: query.passengers,
          itineraryId: query.itineraryId,
        }}
      />

      {outcome === null && (
        <p className="text-body text-lava-muted">{origin === null ? t("noOrigin") : t("noDeparture")}</p>
      )}

      {outcome !== null && origin !== null && query.departure !== null && month !== null && (
        <>
          <FlightResults
            locale={locale}
            search={{
              origin,
              destination,
              departure: query.departure,
              returnDate: query.returnDate,
              passengers: query.passengers,
              itineraryId: query.itineraryId,
            }}
            outcome={outcome}
          />
          <FlightCalendar
            month={month}
            origin={origin}
            destination={destination}
            passengers={query.passengers}
            itineraryId={query.itineraryId}
            days={calendar}
          />
        </>
      )}
    </PageContainer>
  );
}
