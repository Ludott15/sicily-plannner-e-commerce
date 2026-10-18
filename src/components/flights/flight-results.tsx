import { getFormatter, getTranslations } from "next-intl/server";
import { ButtonAnchor } from "@/components/design/button";
import { SICILY_AIRPORTS, type SicilyAirportCode } from "@/lib/flights/airports";
import { type CalendarDay } from "@/lib/flights/offers";
import { serializeFlightSearchParams } from "@/lib/flights/search-params";
import { Link } from "@/lib/i18n/navigation";
import { partnerName } from "@/server/affiliates/links";
import { FLIGHT_LINK_TTL_SECONDS, flightLinkHref, type FlightContext } from "@/server/flights/links";
import { type SearchOutcome } from "@/server/flights/search";

// Risultati di /voli e calendario del mese (passo 2.1). Componenti server: firmano i link verso
// /api/go/flight con FLIGHT_LINK_SECRET, che non esce mai verso il client. Senza segreto nessun
// link: la pagina lo dice e non ne inventa.
// Prezzi sempre "indicativi, aggiornati il …"; il prezzo finale lo mostra il partner.

export type FlightSearchResult = {
  origin: string;
  destination: SicilyAirportCode;
  departure: string;
  returnDate: string | null;
  passengers: number;
  itineraryId: string | null;
};

type SignedLinkInput = Omit<FlightSearchResult, "destination"> & { destination: string; locale: string };

// Link firmato alla ricerca di un aeroporto, o null senza FLIGHT_LINK_SECRET.
export function flightSearchLink(input: SignedLinkInput): string | null {
  const secret = process.env.FLIGHT_LINK_SECRET;
  if (!secret) return null;
  const context: FlightContext = input.itineraryId ? "itinerary" : "flights";
  return flightLinkHref(
    {
      origin: input.origin,
      destination: input.destination,
      departure: input.departure,
      returnDate: input.returnDate,
      passengers: input.passengers,
      context,
      itineraryId: input.itineraryId,
      expiresAt: Math.floor(Date.now() / 1000) + FLIGHT_LINK_TTL_SECONDS,
    },
    secret,
    input.locale,
  );
}

type Props = {
  locale: string;
  search: FlightSearchResult;
  outcome: SearchOutcome;
};

export async function FlightResults({ locale, search, outcome }: Props) {
  const [t, tAff, format] = await Promise.all([getTranslations("Flights"), getTranslations("Affiliates"), getFormatter()]);
  const partner = partnerName("travelpayouts") ?? "Aviasales";
  const lang = locale === "en" ? "en" : "it";

  const partnerLink = (destination: string) => {
    const href = flightSearchLink({ ...search, destination, locale });
    return href ? (
      <ButtonAnchor variant="secondary" size="sm" href={href} rel="sponsored nofollow noopener">
        {t("searchOnPartner", { partner })}
      </ButtonAnchor>
    ) : null;
  };

  if (outcome.status !== "ok") {
    const destination = search.destination;
    const href = flightSearchLink({ ...search, destination, locale });
    return (
      <section aria-labelledby="flight-results" className="flex flex-col gap-4 rounded-xl border border-card-edge bg-calce-raised p-5 md:p-6">
        <h2 id="flight-results" className="is-display text-heading-2">
          {t("resultsTitle", { airport: SICILY_AIRPORTS[destination].name[lang] })}
        </h2>
        <p className="text-body">{t(outcome.status === "unconfigured" ? "unconfigured" : "unavailable")}</p>
        {href ? (
          <div className="flex flex-col items-start gap-2">
            <ButtonAnchor variant="secondary" href={href} rel="sponsored nofollow noopener">
              {t("searchOnPartner", { partner })}
            </ButtonAnchor>
            <p className="text-caption text-lava-muted">{tAff("disclosure", { partner: partnerName("travelpayouts") ?? "Aviasales" })}</p>
          </div>
        ) : (
          <p className="text-body-s text-lava-muted">{t("linkUnconfigured")}</p>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="flight-results" className="flex flex-col gap-6">
      <h2 id="flight-results" className="is-display text-heading-1">
        {t("resultsHeading")}
      </h2>
      {outcome.results.map(({ airport, best }) => {
        const headingId = `flight-result-${airport.iata}`;
        const seeHref = best ? flightSearchLink({ ...search, destination: airport.iata, locale }) : null;
        return (
          <article key={airport.iata} aria-labelledby={headingId} className="flex flex-col gap-4 rounded-xl border border-card-edge bg-calce-raised p-5 md:p-6">
            <h3 id={headingId} className="text-heading-3">
              {t("resultsTitle", { airport: `${airport.name[lang]} (${airport.iata})` })}
            </h3>
            {best ? (
              <>
                <p className="is-display text-heading-2">
                  {t("priceFrom", {
                    price: format.number(best.price, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
                  })}
                </p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body-s text-lava-muted">
                  <li>
                    {format.dateTime(new Date(best.departureAt), {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Rome",
                    })}
                  </li>
                  {best.airline && <li>{t("airline", { airline: best.airline })}</li>}
                  <li>{best.transfers === 0 ? t("direct") : t("stops", { count: best.transfers })}</li>
                </ul>
                <p className="text-caption text-lava-muted">
                  {t("priceUpdated", {
                    when: format.dateTime(new Date(best.updatedAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Europe/Rome",
                    }),
                  })}
                </p>
                {seeHref && (
                  <div className="flex flex-wrap gap-2">
                    <ButtonAnchor variant="primary" size="sm" href={seeHref} rel="sponsored nofollow noopener">
                      {t("seeFlight")}
                    </ButtonAnchor>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-body">{t("noFlights")}</p>
                {partnerLink(airport.iata)}
              </>
            )}
          </article>
        );
      })}
      <div className="flex flex-col gap-1">
        <p className="text-caption text-lava-muted">{tAff("disclosure", { partner: partnerName("travelpayouts") ?? "Aviasales" })}</p>
        <p className="text-caption text-lava-muted">{t("priceDisclaimer")}</p>
      </div>
    </section>
  );
}

type CalendarProps = {
  month: string;
  origin: string;
  destination: SicilyAirportCode;
  passengers: number;
  itineraryId: string | null;
  days: CalendarDay[] | null;
};

// Calendario dei prezzi minimi per giorno del mese di andata: ogni giorno porta alla ricerca di quella data.
export async function FlightCalendar({ month, origin, destination, passengers, itineraryId, days }: CalendarProps) {
  const [t, format] = await Promise.all([getTranslations("Flights"), getFormatter()]);
  if (days === null) return null;
  const monthLabel = format.dateTime(new Date(`${month}-01T12:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" });
  if (days.length === 0) {
    return (
      <section aria-labelledby="flight-calendar" className="flex flex-col gap-3">
        <h2 id="flight-calendar" className="is-display text-heading-2">
          {t("calendarTitle", { month: monthLabel })}
        </h2>
        <p className="text-body text-lava-muted">{t("calendarEmpty")}</p>
      </section>
    );
  }
  const lowest = Math.min(...days.map((day) => day.price));
  return (
    <section aria-labelledby="flight-calendar" className="flex flex-col gap-4">
      <h2 id="flight-calendar" className="is-display text-heading-2">
        {t("calendarTitle", { month: monthLabel })}
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const query = serializeFlightSearchParams({
            origin,
            destination,
            departure: day.date,
            returnDate: null,
            passengers,
            itineraryId,
          });
          return (
            <li key={day.date}>
              <Link
                href={`/voli?${query}`}
                className={
                  "flex min-h-11 flex-col gap-1 rounded-lg border bg-calce-raised p-3 text-body-s hover:bg-coccio-tint focus-visible:outline-2 focus-visible:outline-focus " +
                  (day.price === lowest ? "border-coccio" : "border-border-control")
                }
              >
                <span className="font-semibold">
                  {format.dateTime(new Date(`${day.date}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                </span>
                <span className="text-lava-muted">
                  {t("priceFrom", {
                    price: format.number(day.price, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
                  })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-lava-muted">{t("priceDisclaimer")}</p>
    </section>
  );
}
