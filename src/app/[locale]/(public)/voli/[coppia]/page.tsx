import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FlightCalendar } from "@/components/flights/flight-results";
import { FlightSearch } from "@/components/flights/flight-search";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { SICILY_AIRPORTS } from "@/lib/flights/airports";
import { getDeparture } from "@/lib/flights/departures";
import { nextMonth } from "@/lib/flights/offers";
import { findPopularRoute, type PopularRoute } from "@/lib/flights/routes";
import { canonicalFor } from "@/lib/seo";
import { monthCalendar, routeHasPrices } from "@/server/flights/search";

// Pagina di coppia /voli/[coppia] (passo 2.1): città di partenza → aeroporto siciliano, solo per
// le coppie in POPULAR_ROUTES. Senza prezzi (anche senza token) risponde 404: nessuna pagina vuota
// indicizzata. Mostra il calendario dei prezzi del mese successivo e il modulo di ricerca.

type Props = { params: Promise<{ locale: string; coppia: string }> };

function routeNames(route: PopularRoute, lang: "it" | "en") {
  const origin = getDeparture(route.origin);
  return {
    origin: origin ? (lang === "en" ? origin.city_en : origin.city_it) : route.origin,
    destination: SICILY_AIRPORTS[route.destination].city[lang],
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, coppia } = await params;
  const route = findPopularRoute(coppia);
  if (!route) return { robots: { index: false, follow: false } };
  const lang = locale === "en" ? "en" : "it";
  const names = routeNames(route, lang);
  const t = await getTranslations({ locale, namespace: "Flights" });
  return {
    title: t("routeTitle", names),
    description: t("routeDescription", names),
    alternates: canonicalFor(locale, `/voli/${route.slug}`),
  };
}

export default async function FlightRoutePage({ params }: Props) {
  const { locale, coppia } = await params;
  setRequestLocale(locale);
  const route = findPopularRoute(coppia);
  if (!route) notFound();
  if (!(await routeHasPrices(route))) notFound();

  const lang = locale === "en" ? "en" : "it";
  const names = routeNames(route, lang);
  const month = nextMonth(new Date());
  const [t, days] = await Promise.all([
    getTranslations("Flights"),
    monthCalendar({ origin: route.origin, destination: route.destination, month }),
  ]);

  return (
    <PageContainer width="work">
      <PageHeader eyebrow={t("eyebrow")} title={t("routeTitle", names)} subtitle={t("routeIntro", names)} />

      <FlightSearch
        variant="compact"
        initial={{
          origin: route.origin,
          destination: route.destination,
          departure: null,
          returnDate: null,
          passengers: 1,
          itineraryId: null,
        }}
      />

      <FlightCalendar
        month={month}
        origin={route.origin}
        destination={route.destination}
        passengers={1}
        itineraryId={null}
        days={days}
      />
    </PageContainer>
  );
}
