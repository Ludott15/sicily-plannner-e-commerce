import { getTranslations, setRequestLocale } from "next-intl/server";
import { DateInput, Field } from "@/components/admin/fields";
import { Button, ButtonAnchor, ButtonLink } from "@/components/design";
import { PERIOD_DAYS, resolvePeriod, type PeriodDays } from "@/lib/affiliate-conversions/period";
import { getPathname } from "@/lib/i18n/navigation";
import {
  ACTIVITY_LIMIT,
  getConversionDashboard,
  type ConversionDashboard,
  type DashboardBreakdown,
} from "@/server/affiliates/conversions-dashboard.admin";

// Dashboard delle conversioni affiliate (passo 3.3). Il periodo sta nell'URL: giorni=7|30|90, oppure
// da=&a= per un intervallo personalizzato. La lettura e il controllo admin stanno in
// conversions-dashboard.admin.ts (requireAdmin); il layout dell'area admin già controlla l'accesso.

type SearchParamValue = string | string[] | undefined;
type SearchParams = { giorni?: SearchParamValue; da?: SearchParamValue; a?: SearchParamValue };

// Con ?da=a&da=b Next passa un array: vale il primo valore.
function first(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const PRESET_KEYS: Record<PeriodDays, "days7" | "days30" | "days90"> = {
  7: "days7",
  30: "days30",
  90: "days90",
};

const KNOWN_CONTEXTS = ["page", "itinerary", "chat", "flights"] as const;
type KnownContext = (typeof KNOWN_CONTEXTS)[number];

function isKnownContext(key: string): key is KnownContext {
  return (KNOWN_CONTEXTS as readonly string[]).includes(key);
}

function formatEur(value: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(Number(value));
}

function formatRate(rate: number | null, locale: string): string {
  if (rate === null) return "—";
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(rate);
}

function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

export default async function AdminAffiliatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const period = resolvePeriod({ giorni: first(query.giorni), da: first(query.da), a: first(query.a) }, new Date());
  const [t, dashboard] = await Promise.all([getTranslations("AdminAffiliates"), getConversionDashboard(period)]);

  const exportQuery: Record<string, string> =
    period.days === null ? { da: period.from, a: period.to } : { giorni: String(period.days) };
  const exportHref = `${getPathname({ href: "/admin/affiliati/export", locale })}?${new URLSearchParams(exportQuery).toString()}`;
  const importHref = "/admin/affiliati/importa";
  const { totals } = dashboard;
  const noClicks = totals.clicks === 0;

  const contextLabel = (key: string): string => (isKnownContext(key) ? t(`contexts.${key}`) : key);

  const contextRows: BreakdownRow[] = dashboard.byContext.map((row) => toRow(row, contextLabel(row.key), locale));
  const partnerRows: BreakdownRow[] = dashboard.byPartner.map((row) => toRow(row, row.key, locale));
  const activityRows: BreakdownRow[] = dashboard.byActivity.map((row) => ({
    id: row.activityId,
    label: row.title,
    hint: row.slug,
    clicks: formatCount(row.clicks, locale),
    conversions: formatCount(row.conversions, locale),
    commission: formatEur(row.commissionEur, locale),
    rate: formatRate(row.conversionRate, locale),
  }));

  const columns = {
    clicks: t("columns.clicks"),
    conversions: t("columns.conversions"),
    commission: t("columns.commission"),
    rate: t("columns.rate"),
  };

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="is-display text-heading-1">{t("title")}</h1>
          <p className="max-w-2xl text-body text-lava-muted">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonAnchor href={exportHref} variant="secondary">
            {t("export")}
          </ButtonAnchor>
          <ButtonLink href={importHref} variant="secondary">
            {t("importLink")}
          </ButtonLink>
        </div>
      </div>

      <PeriodPicker
        locale={locale}
        period={{ days: period.days, from: period.from, to: period.to }}
        labels={{
          label: t("period.label"),
          presets: PERIOD_DAYS.map((days) => ({ days, label: t(`period.${PRESET_KEYS[days]}`) })),
          custom: t("period.custom"),
          from: t("period.from"),
          to: t("period.to"),
          apply: t("period.apply"),
          range: t("period.range", { from: period.from, to: period.to }),
          customHint: t("period.customHint"),
        }}
      />

      <section aria-labelledby="affiliati-totali" className="flex flex-col gap-4">
        <h2 id="affiliati-totali" className="sr-only">
          {t("title")}
        </h2>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Tile label={t("totals.clicks")} value={formatCount(totals.clicks, locale)} />
          <Tile label={t("totals.conversions")} value={formatCount(totals.conversions, locale)} />
          <Tile label={t("totals.approved")} value={formatEur(totals.approvedCommissionEur, locale)} />
          <Tile label={t("totals.pending")} value={formatEur(totals.pendingCommissionEur, locale)} />
          <Tile label={t("totals.rate")} value={formatRate(totals.conversionRate, locale)} />
        </dl>
        {noClicks && <p className="text-body text-lava-muted">{t("totals.noClicks")}</p>}
      </section>

      <BreakdownSection
        headingId="affiliati-contesto"
        heading={t("sections.context")}
        keyHeader={t("columns.key")}
        columns={columns}
        rows={contextRows}
        emptyText={t("empty")}
      />

      <BreakdownSection
        headingId="affiliati-partner"
        heading={t("sections.partner")}
        keyHeader={t("columns.partner")}
        columns={columns}
        rows={partnerRows}
        emptyText={t("empty")}
      />

      <BreakdownSection
        headingId="affiliati-attivita"
        heading={t("sections.activity", { limit: ACTIVITY_LIMIT })}
        keyHeader={t("columns.key")}
        columns={columns}
        rows={activityRows}
        emptyText={t("empty")}
      />

      <UnlinkedSection
        unlinked={dashboard.unlinked}
        locale={locale}
        labels={{
          heading: t("sections.unlinked"),
          help: t("sections.unlinkedHelp"),
          empty: t("empty"),
          subid: t("columns.subid"),
          partner: t("columns.partner"),
          conversions: t("columns.conversions"),
          commission: t("columns.commission"),
          lastReported: t("columns.lastReported"),
        }}
      />
    </section>
  );
}

type BreakdownRow = {
  id: string;
  label: string;
  hint?: string;
  clicks: string;
  conversions: string;
  commission: string;
  rate: string;
};

function toRow(row: DashboardBreakdown, label: string, locale: string): BreakdownRow {
  return {
    id: row.key,
    label,
    clicks: formatCount(row.clicks, locale),
    conversions: formatCount(row.conversions, locale),
    commission: formatEur(row.commissionEur, locale),
    rate: formatRate(row.conversionRate, locale),
  };
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-divider bg-calce-raised p-4">
      <dt className="text-body-s text-lava-muted">{label}</dt>
      <dd className="is-display text-heading-2 tabular-nums">{value}</dd>
    </div>
  );
}

function PeriodPicker({
  locale,
  period,
  labels,
}: {
  locale: string;
  period: { days: PeriodDays | null; from: string; to: string };
  labels: {
    label: string;
    presets: { days: PeriodDays; label: string }[];
    custom: string;
    from: string;
    to: string;
    apply: string;
    range: string;
    customHint: string;
  };
}) {
  const formAction = getPathname({ href: "/admin/affiliati", locale });
  return (
    <section aria-label={labels.label} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-body-s font-semibold">{labels.label}</span>
        {labels.presets.map((preset) => {
          const active = period.days === preset.days;
          return (
            <ButtonLink
              key={preset.days}
              href={`/admin/affiliati?giorni=${preset.days}`}
              variant={active ? "primary" : "secondary"}
              size="sm"
              aria-current={active ? "true" : undefined}
            >
              {preset.label}
            </ButtonLink>
          );
        })}
      </div>
      <form method="get" action={formAction} className="flex flex-wrap items-end gap-4">
        <Field label={labels.custom} htmlFor="affiliati-da">
          <DateInput id="affiliati-da" name="da" defaultValue={period.from} required className="w-auto" />
        </Field>
        <Field label={labels.to} htmlFor="affiliati-a">
          <DateInput id="affiliati-a" name="a" defaultValue={period.to} required className="w-auto" />
        </Field>
        <Button type="submit" variant="secondary">
          {labels.apply}
        </Button>
        <p className="text-body-s text-lava-muted">
          {labels.range} · {labels.customHint}
        </p>
      </form>
    </section>
  );
}

function BreakdownSection({
  headingId,
  heading,
  keyHeader,
  columns,
  rows,
  emptyText,
}: {
  headingId: string;
  heading: string;
  keyHeader: string;
  columns: { clicks: string; conversions: string; commission: string; rate: string };
  rows: BreakdownRow[];
  emptyText: string;
}) {
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="is-display text-heading-2">
        {heading}
      </h2>
      {rows.length === 0 ? (
        <p className="text-body text-lava-muted">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-labelledby={headingId} className="w-full min-w-[560px] border-collapse text-body-s">
            <thead>
              <tr className="text-label uppercase text-lava-muted">
                <th scope="col" className="border-b border-divider px-3 py-2 text-left">
                  {keyHeader}
                </th>
                <th scope="col" className="border-b border-divider px-3 py-2 text-right">
                  {columns.clicks}
                </th>
                <th scope="col" className="border-b border-divider px-3 py-2 text-right">
                  {columns.conversions}
                </th>
                <th scope="col" className="border-b border-divider px-3 py-2 text-right">
                  {columns.commission}
                </th>
                <th scope="col" className="border-b border-divider px-3 py-2 text-right">
                  {columns.rate}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="border-b border-divider px-3 py-2 text-left font-semibold">
                    {row.label}
                    {row.hint && <span className="block text-caption font-normal text-lava-muted">{row.hint}</span>}
                  </th>
                  <td className="border-b border-divider px-3 py-2 text-right tabular-nums">{row.clicks}</td>
                  <td className="border-b border-divider px-3 py-2 text-right tabular-nums">{row.conversions}</td>
                  <td className="border-b border-divider px-3 py-2 text-right tabular-nums">{row.commission}</td>
                  <td className="border-b border-divider px-3 py-2 text-right tabular-nums">{row.rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function UnlinkedSection({
  unlinked,
  locale,
  labels,
}: {
  unlinked: ConversionDashboard["unlinked"];
  locale: string;
  labels: {
    heading: string;
    help: string;
    empty: string;
    subid: string;
    partner: string;
    conversions: string;
    commission: string;
    lastReported: string;
  };
}) {
  return (
    <section aria-labelledby="affiliati-senza-click" className="flex flex-col gap-3">
      <h2 id="affiliati-senza-click" className="is-display text-heading-2">
        {labels.heading}
      </h2>
      <p className="max-w-2xl text-body-s text-lava-muted">{labels.help}</p>
      {unlinked.length === 0 ? (
        <p className="text-body text-lava-muted">{labels.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-labelledby="affiliati-senza-click" className="w-full min-w-[640px] border-collapse text-body-s">
            <thead>
              <tr className="text-label uppercase text-lava-muted">
                <th scope="col" className="border-b border-divider px-3 py-2 text-left">
                  {labels.subid}
                </th>
                <th scope="col" className="border-b border-divider px-3 py-2 text-left">
                  {labels.partner}
                </th>
                <th scope="col" className="border-b border-divider px-3 py-2 text-right">
                  {labels.conversions}
                </th>
                <th scope="col" className="border-b border-divider px-3 py-2 text-right">
                  {labels.commission}
                </th>
                <th scope="col" className="border-b border-divider px-3 py-2 text-right">
                  {labels.lastReported}
                </th>
              </tr>
            </thead>
            <tbody>
              {unlinked.map((row) => (
                <tr key={`${row.partner}-${row.subid}`}>
                  <th scope="row" className="border-b border-divider px-3 py-2 text-left font-normal">
                    {row.subid}
                  </th>
                  <td className="border-b border-divider px-3 py-2 text-left">{row.partner}</td>
                  <td className="border-b border-divider px-3 py-2 text-right tabular-nums">
                    {formatCount(row.conversions, locale)}
                  </td>
                  <td className="border-b border-divider px-3 py-2 text-right tabular-nums">
                    {formatEur(row.commissionEur, locale)}
                  </td>
                  <td className="border-b border-divider px-3 py-2 text-right tabular-nums">{row.lastReportedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
