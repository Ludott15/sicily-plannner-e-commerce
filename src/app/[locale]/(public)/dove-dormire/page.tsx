import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buttonClass, ButtonAnchor, PendingButton } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { isIsoDate } from "@/lib/flights/search-params";
import { localizedAlternates } from "@/lib/seo";
import { getPartnerConfig, VERTICAL_PARTNER } from "@/server/affiliates/partners";
import {
  getLodgingPageData,
  verticalAvailability,
  verticalSearchHref,
} from "@/server/affiliates/verticals";

// Dove dormire (passo 3.1): scelta di area o città, date e persone, poi un link firmato verso
// Booking (/api/go/v costruisce la destinazione dal template del partner). Senza ID del partner la
// pagina dice "in arrivo" e non mostra il form. Nessun testo inventato sulle strutture.
// Finché il partner non è pronto la pagina non è indicizzata.

const DEFAULT_ADULTS = 2;
const MAX_ADULTS = 30;
const FIELD =
  "min-h-11 w-full rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 text-body text-lava";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    luogo?: string;
    checkin?: string;
    checkout?: string;
    persone?: string;
    avviso?: string;
  }>;
};

function isoOrEmpty(value: string | undefined): string {
  return value && isIsoDate(value) ? value : "";
}

function adultsOf(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_ADULTS ? n : DEFAULT_ADULTS;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const [t, availability] = await Promise.all([
    getTranslations({ locale, namespace: "Lodging" }),
    verticalAvailability("lodging"),
  ]);
  return {
    title: t("title"),
    description: t("intro"),
    alternates: localizedAlternates(locale, "/dove-dormire"),
    ...(availability === "ready" ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function LodgingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tAff, tVert, query, data, config, availability] = await Promise.all([
    getTranslations("Lodging"),
    getTranslations("Affiliates"),
    getTranslations("Verticals"),
    searchParams,
    getLodgingPageData(locale),
    getPartnerConfig(VERTICAL_PARTNER.lodging),
    verticalAvailability("lodging"),
  ]);

  const options = [
    ...data.areas.map((a) => ({ key: `area:${a.slug}`, label: a.name })),
    ...data.cities.map((c) => ({ key: `city:${c.slug}`, label: c.name })),
  ];
  const selected = options.find((o) => o.key === query.luogo) ?? null;
  const checkin = isoOrEmpty(query.checkin);
  const checkout = isoOrEmpty(query.checkout);
  const adults = adultsOf(query.persone);
  const datesOk = checkin !== "" && checkout !== "" && checkout > checkin;
  const partnerName = config?.name ?? "";

  const href =
    availability === "ready" && selected && datesOk
      ? await verticalSearchHref({
          vertical: "lodging",
          query: selected.label,
          airport: "",
          checkin,
          checkout,
          adults,
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
          <PendingButton id="vertical.lodging" variant="primary">
            {t("submit")}
          </PendingButton>
        </div>
      ) : (
        <>
          <form method="get" className="grid gap-4 rounded-lg border border-card-edge bg-calce-raised p-6 md:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-1.5 lg:col-span-2">
              <label htmlFor="luogo" className="text-body-s font-semibold">
                {t("placeLabel")}
              </label>
              <select id="luogo" name="luogo" defaultValue={selected?.key ?? ""} required className={FIELD}>
                <option value="" disabled>
                  {t("placePlaceholder")}
                </option>
                <optgroup label={t("placeGroupAreas")}>
                  {data.areas.map((a) => (
                    <option key={a.slug} value={`area:${a.slug}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
                {data.cities.length > 0 && (
                  <optgroup label={t("placeGroupCities")}>
                    {data.cities.map((c) => (
                      <option key={c.slug} value={`city:${c.slug}`}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="checkin" className="text-body-s font-semibold">
                {t("checkin")}
              </label>
              <input id="checkin" name="checkin" type="date" defaultValue={checkin} className={FIELD} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="checkout" className="text-body-s font-semibold">
                {t("checkout")}
              </label>
              <input id="checkout" name="checkout" type="date" defaultValue={checkout} className={FIELD} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="persone" className="text-body-s font-semibold">
                {t("people")}
              </label>
              <input id="persone" name="persone" type="number" min={1} max={MAX_ADULTS} defaultValue={adults} className={FIELD} />
            </div>
            <div className="flex items-end lg:col-span-5">
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
                {!selected ? t("pickPlace") : datesOk ? tVert("unavailable") : t("needDates")}
              </p>
            )}
          </div>
        </>
      )}
    </PageContainer>
  );
}
