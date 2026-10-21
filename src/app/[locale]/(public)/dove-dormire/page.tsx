import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DateField, Select } from "@/components/design";
import { VerticalExtras } from "@/components/verticals/vertical-extras";
import { VerticalField, VerticalForm } from "@/components/verticals/vertical-form";
import { VerticalNotices, VerticalResult, type SummaryItem } from "@/components/verticals/vertical-result";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Link } from "@/lib/i18n/navigation";
import { canonicalFor } from "@/lib/seo";
import { cn } from "@/lib/utils";
import {
  countParam,
  formatIsoDate,
  isoParam,
  oneOfParam,
  paramOf,
  queryString,
  rangeOk,
  type ParamValue,
} from "@/lib/verticals/search-params";
import { activePartners, publishedGuides, searchOutcome } from "@/server/affiliates/vertical-page-data";
import { getLodgingPageData } from "@/server/affiliates/verticals";
import {
  kindFilterValue,
  LODGING_KINDS,
  type LodgingKind,
  VERTICAL_PAGE,
  VERTICAL_PARTNERS,
} from "@/server/affiliates/vertical-links";
import { VERTICAL_PARTNER } from "@/server/affiliates/partners";

// Dove dormire (verticale lodging): zona o città, date, persone e tipo di alloggio. Il link firmato va
// a Booking (predefinito), con le alternative Hostelworld (ostelli) e Pitchup (campeggi) nella stessa
// pagina. Il tipo passa da una mappa chiusa nel server: il valore dell'URL non arriva mai al link.

const MAX_ADULTS = 30;
const DEFAULT_ADULTS = 2;
const PAGE = VERTICAL_PAGE.lodging;

const KIND_KEYS = {
  hotel: "kindHotel",
  bnb: "kindBnb",
  ostello: "kindOstello",
  campeggio: "kindCampeggio",
  agriturismo: "kindAgriturismo",
  casa_vacanze: "kindCasa",
} as const satisfies Record<LodgingKind, string>;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, ParamValue>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Lodging" });
  return {
    title: t("title"),
    description: t("intro"),
    alternates: canonicalFor(locale, `/${PAGE}`),
  };
}

export default async function LodgingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tVert, query, data, partners] = await Promise.all([
    getTranslations("Lodging"),
    getTranslations("Verticals"),
    searchParams,
    getLodgingPageData(locale),
    activePartners("lodging"),
  ]);

  const options = [
    ...data.areas.map((a) => ({ value: `area:${a.slug}`, label: a.name, slug: a.slug, group: "area" as const })),
    ...data.cities.map((c) => ({ value: `city:${c.slug}`, label: c.name, slug: c.slug, group: "city" as const })),
  ];
  const selected = options.find((o) => o.value === paramOf(query.luogo)) ?? null;
  const checkin = isoParam(query.checkin);
  const checkout = isoParam(query.checkout);
  const adults = countParam(query.persone, DEFAULT_ADULTS, MAX_ADULTS);
  const partner = oneOfParam(query.partner, VERTICAL_PARTNERS.lodging) || VERTICAL_PARTNER.lodging;
  // Il filtro sul tipo passa dalla mappa chiusa del server (kindFilterValue). Dove il partner non ha un
  // filtro per nessun tipo, il tipo non arriva al partner: non si mostra né tra i chip né nel riepilogo.
  const kindSupported = LODGING_KINDS.some((k) => kindFilterValue(partner, k) !== "");
  const kind = kindSupported ? oneOfParam(query.tipo, LODGING_KINDS) : "";
  const datesOk = rangeOk(checkin, checkout);

  const outcome =
    selected && datesOk
      ? await searchOutcome(
          {
            vertical: "lodging",
            place: selected.slug,
            checkin,
            checkout,
            adults,
            kind,
            partner,
          },
          { context: "page", itineraryId: null, locale },
        )
      : null;

  const summary: SummaryItem[] = [];
  if (selected) summary.push({ label: tVert("fieldPlace"), value: selected.label });
  if (checkin) summary.push({ label: tVert("fieldCheckin"), value: formatIsoDate(checkin, locale) });
  if (checkout) summary.push({ label: tVert("fieldCheckout"), value: formatIsoDate(checkout, locale) });
  if (selected || checkin || checkout) summary.push({ label: t("people"), value: String(adults) });
  if (kind) summary.push({ label: tVert("fieldKind"), value: tVert(KIND_KEYS[kind]) });

  const placeLabel: string | undefined = selected?.label;
  const hint = !selected ? t("pickPlace") : t("needDates");

  // Stessa ricerca su un altro sito partner, con gli stessi campi.
  const current = {
    luogo: selected?.value ?? "",
    checkin,
    checkout,
    persone: String(adults),
    tipo: kind,
  };
  const alternatives = partners
    .filter((p) => p.partner !== partner)
    .map((p) => ({ name: p.name, href: queryString({ ...current, partner: p.partner }) }));

  const kindHref = (value: LodgingKind | ""): string => queryString({ ...current, tipo: value, partner: partner === VERTICAL_PARTNER.lodging ? "" : partner });

  const tips = [t("tip1"), t("tip2"), t("tip3")];
  const faq = [
    { question: t("faq1q"), answer: t("faq1a") },
    { question: t("faq2q"), answer: t("faq2a") },
    { question: t("faq3q"), answer: t("faq3a") },
  ];
  const guides = await publishedGuides(locale, ["prima-volta-in-sicilia", "quando-andare-in-sicilia"]);

  return (
    <PageContainer width="work">
      <PageHeader
        title={t("title")}
        subtitle={t("intro")}
        breadcrumb={[{ label: tVert("servicesCrumb"), href: "/servizi" }]}
        breadcrumbLabel={tVert("servicesLabel")}
      />

      <VerticalNotices avviso={paramOf(query.avviso)} />

      {kindSupported && (
      <nav aria-label={t("kindLabel")} className="flex flex-wrap gap-2">
        {[{ value: "" as const, label: tVert("kindAll") }, ...LODGING_KINDS.map((value) => ({ value, label: tVert(KIND_KEYS[value]) }))].map(
          (chip) => {
            const active = chip.value === kind;
            return (
              <Link
                key={chip.value || "all"}
                href={`/${PAGE}${kindHref(chip.value)}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-pill border px-4 text-body-s",
                  active ? "border-coccio bg-coccio text-on-coccio" : "border-border-control bg-calce-raised",
                )}
              >
                {chip.label}
              </Link>
            );
          },
        )}
      </nav>
      )}

      <VerticalForm
        submitLabel={t("submit")}
        hidden={{ tipo: kind, partner: partner === VERTICAL_PARTNER.lodging ? "" : partner }}
      >
        <VerticalField label={t("placeLabel")} wide>
          <Select
            name="luogo"
            label={t("placeLabel")}
            options={options.map((o) => ({ value: o.value, label: o.label, description: o.group === "area" ? t("placeGroupAreas") : t("placeGroupCities") }))}
            defaultValue={selected?.value}
            placeholder={t("placePlaceholder")}
            required
          />
        </VerticalField>
        <VerticalField label={t("checkin")} htmlFor="checkin">
          <DateField id="checkin" name="checkin" defaultValue={checkin} label={t("checkin")} placeholder={t("checkin")} />
        </VerticalField>
        <VerticalField label={t("checkout")} htmlFor="checkout">
          <DateField id="checkout" name="checkout" defaultValue={checkout} label={t("checkout")} placeholder={t("checkout")} />
        </VerticalField>
        <VerticalField label={t("people")} htmlFor="persone">
          <input
            id="persone"
            name="persone"
            type="number"
            min={1}
            max={MAX_ADULTS}
            defaultValue={adults}
            className="is-field min-h-11 w-full px-3 text-body"
          />
        </VerticalField>
      </VerticalForm>

      <VerticalResult summary={summary} outcome={outcome} hint={hint} placeName={placeLabel} />

      <VerticalExtras tips={tips} faq={faq} guides={guides} alternatives={alternatives} />
    </PageContainer>
  );
}
