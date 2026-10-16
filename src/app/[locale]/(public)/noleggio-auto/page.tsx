import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buttonClass, ButtonAnchor, PendingButton } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { isSicilyAirport } from "@/lib/flights/airports";
import { isIsoDate } from "@/lib/flights/search-params";
import { canonicalFor } from "@/lib/seo";
import { getPartnerConfig, VERTICAL_PARTNER } from "@/server/affiliates/partners";
import { carAirports, verticalAvailability, verticalSearchHref } from "@/server/affiliates/verticals";

// Noleggio auto (passo 3.1): aeroporto siciliano, date di ritiro e riconsegna, poi un link firmato
// verso DiscoverCars. Senza ID del partner la pagina dice "in arrivo" e non mostra il form.
// Finché il partner non è pronto la pagina non è indicizzata.

const CAR_ADULTS = 1;
const FIELD =
  "min-h-11 w-full rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 text-body text-lava";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    aeroporto?: string;
    checkin?: string;
    checkout?: string;
    avviso?: string;
  }>;
};

function isoOrEmpty(value: string | undefined): string {
  return value && isIsoDate(value) ? value : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const [t, availability] = await Promise.all([
    getTranslations({ locale, namespace: "Cars" }),
    verticalAvailability("car"),
  ]);
  return {
    title: t("title"),
    description: t("intro"),
    alternates: canonicalFor(locale, "/noleggio-auto"),
    ...(availability === "ready" ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function CarRentalPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tAff, tVert, query, config, availability] = await Promise.all([
    getTranslations("Cars"),
    getTranslations("Affiliates"),
    getTranslations("Verticals"),
    searchParams,
    getPartnerConfig(VERTICAL_PARTNER.car),
    verticalAvailability("car"),
  ]);

  const airports = carAirports(locale);
  const airport = query.aeroporto && isSicilyAirport(query.aeroporto) ? query.aeroporto : "";
  const checkin = isoOrEmpty(query.checkin);
  const checkout = isoOrEmpty(query.checkout);
  const datesOk = checkin !== "" && checkout !== "" && checkout > checkin;
  const partnerName = config?.name ?? "";

  const href =
    availability === "ready" && airport !== "" && datesOk
      ? await verticalSearchHref({
          vertical: "car",
          query: "",
          airport,
          checkin,
          checkout,
          adults: CAR_ADULTS,
          context: "page",
          itineraryId: null,
          locale,
        })
      : null;

  return (
    <PageContainer width="work">
      <PageHeader title={t("title")} subtitle={t("intro")} />

      {query.avviso === "non-disponibile" && (
        <p role="alert" className="rounded-lg border border-card-edge bg-calce-raised p-4 text-body">
          {tVert("unavailable")}
        </p>
      )}

      {query.avviso === "troppi-click" && (
        <p role="alert" className="rounded-lg border border-card-edge bg-calce-raised p-4 text-body">
          {tVert("rateLimited")}
        </p>
      )}

      {availability !== "ready" ? (
        <div className="flex max-w-2xl flex-col items-start gap-3 rounded-lg border border-card-edge bg-calce-raised p-6">
          <p className="text-label uppercase text-lava-muted">{tVert("comingSoon")}</p>
          <p className="text-body-l">{t("comingSoonText")}</p>
          <PendingButton id="vertical.car" variant="primary">
            {t("submit")}
          </PendingButton>
        </div>
      ) : (
        <>
          <form method="get" className="grid gap-4 rounded-lg border border-card-edge bg-calce-raised p-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5 lg:col-span-2">
              <label htmlFor="aeroporto" className="text-body-s font-semibold">
                {t("airportLabel")}
              </label>
              <select id="aeroporto" name="aeroporto" defaultValue={airport} required className={FIELD}>
                <option value="" disabled>
                  {t("airportPlaceholder")}
                </option>
                {airports.map((a) => (
                  <option key={a.iata} value={a.iata}>
                    {t("airportOption", { name: a.name, city: a.city, iata: a.iata })}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="checkin" className="text-body-s font-semibold">
                {t("pickup")}
              </label>
              <input id="checkin" name="checkin" type="date" defaultValue={checkin} className={FIELD} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="checkout" className="text-body-s font-semibold">
                {t("dropoff")}
              </label>
              <input id="checkout" name="checkout" type="date" defaultValue={checkout} className={FIELD} />
            </div>
            <div className="flex items-end lg:col-span-4">
              <button type="submit" className={buttonClass("primary", "md", "w-full md:w-auto")}>
                {t("submit")}
              </button>
            </div>
          </form>

          <div className="flex flex-col items-start gap-2">
            {href && partnerName ? (
              <>
                <ButtonAnchor variant="primary" href={href} rel="sponsored noopener">
                  {t("searchOn", { partner: partnerName })}
                </ButtonAnchor>
                <p className="text-caption text-lava-muted">{tAff("disclosure", { partner: partnerName })}</p>
              </>
            ) : (
              <p className="text-body text-lava-muted">
                {airport === "" ? t("pickAirport") : datesOk ? tVert("unavailable") : t("needDates")}
              </p>
            )}
          </div>
        </>
      )}
    </PageContainer>
  );
}
