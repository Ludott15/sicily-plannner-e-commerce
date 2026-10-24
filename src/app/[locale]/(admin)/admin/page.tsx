import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { DateInput, Field } from "@/components/admin/fields";
import { Button, ButtonLink } from "@/components/design";
import { getPathname } from "@/lib/i18n/navigation";
import { adminDashboard, parseDashboardRange } from "@/server/analytics/dashboard.admin";

// Home dell'area admin (passo 10.1): in cima i numeri del periodo, scelto con Da/A nell'URL
// (?da=&a=, date yyyy-mm-dd in ora di Roma; senza parametri gli ultimi 30 giorni). La lettura e il
// controllo admin stanno in dashboard.admin.ts (requireAdmin); il layout dell'area già blocca gli altri.

type SearchParamValue = string | string[] | undefined;
type SearchParams = { da?: SearchParamValue; a?: SearchParamValue };
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> };
type DashboardTile = { label: string; value: string; detail?: string };

// Con ?da=a&da=b Next passa un array: vale il primo valore.
function first(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Data di oggi in Europe/Rome nel formato yyyy-mm-dd, letta dai pezzi della data e non dalla stringa locale.
function romeToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: "year" | "month" | "day"): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export default async function AdminHome({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const range = parseDashboardRange({ da: first(query.da), a: first(query.a) }, romeToday(new Date()));
  const [t, format, metrics] = await Promise.all([
    getTranslations("Admin.dashboard"),
    getFormatter(),
    adminDashboard(range),
  ]);

  const count = (value: number): string => format.number(value, { maximumFractionDigits: 0 });
  const eur = (value: number): string => format.number(value, { style: "currency", currency: "EUR" });
  const usd = (value: number): string =>
    format.number(value, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const percent = (value: number): string => format.number(value, { style: "percent", maximumFractionDigits: 0 });
  // "x su y": il rapporto con totale zero non esiste, quindi resta un trattino.
  const ratio = (part: number, total: number): string =>
    total > 0 ? t("ratio", { part: count(part), total: count(total) }) : "—";
  // La quota compare solo quando il totale non è zero.
  const share = (part: number, total: number): string | undefined =>
    total > 0 ? t("share", { percent: percent(part / total) }) : undefined;

  // Valori null (nessun dato calcolabile) restano un trattino.
  const avgOrder = metrics.avgOrderCents === null ? "—" : eur(metrics.avgOrderCents / 100);
  const costPerUser = metrics.aiCostPerActiveUserUsd === null ? "—" : usd(metrics.aiCostPerActiveUserUsd);

  const groups: { id: string; heading: string; tiles: DashboardTile[] }[] = [
    {
      id: "dashboard-utenti",
      heading: t("groupUsers"),
      tiles: [
        { label: t("newUsers"), value: count(metrics.newUsers) },
        { label: t("guestsConverted"), value: count(metrics.guestsConverted) },
        { label: t("activeUsers"), value: count(metrics.activeUsers) },
      ],
    },
    {
      id: "dashboard-viaggi",
      heading: t("groupTrips"),
      tiles: [
        { label: t("tripsCreated"), value: count(metrics.tripsCreated) },
        {
          label: t("tripsWithClick"),
          value: ratio(metrics.tripsWithAffiliateClick, metrics.tripsCreated),
          detail: share(metrics.tripsWithAffiliateClick, metrics.tripsCreated),
        },
        { label: t("affiliateClicks"), value: count(metrics.affiliateClicks) },
        { label: t("commissions"), value: eur(metrics.commissionsCents / 100) },
        { label: t("orders"), value: count(metrics.orders) },
        { label: t("avgOrder"), value: avgOrder },
      ],
    },
    {
      id: "dashboard-inviti",
      heading: t("groupInvites"),
      tiles: [
        { label: t("invitesSent"), value: count(metrics.invitesSent) },
        {
          label: t("invitesAccepted"),
          value: ratio(metrics.invitesAccepted, metrics.invitesSent),
          detail: share(metrics.invitesAccepted, metrics.invitesSent),
        },
      ],
    },
    {
      id: "dashboard-assistente",
      heading: t("groupAi"),
      tiles: [
        { label: t("aiCost"), value: usd(metrics.aiCostUsd) },
        { label: t("aiCostPerUser"), value: costPerUser },
      ],
    },
  ];

  const formAction = getPathname({ href: "/admin", locale });

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("pageTitle")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("intro")}</p>
      </div>

      <section aria-labelledby="dashboard-numeri" className="flex flex-col gap-6">
        <h2 id="dashboard-numeri" className="is-display text-heading-2">
          {t("title")}
        </h2>

        <form method="get" action={formAction} className="flex flex-wrap items-end gap-4">
          <Field label={t("from")} htmlFor="dashboard-da">
            <DateInput id="dashboard-da" name="da" defaultValue={range.from} required className="w-auto" />
          </Field>
          <Field label={t("to")} htmlFor="dashboard-a">
            <DateInput id="dashboard-a" name="a" defaultValue={range.to} required className="w-auto" />
          </Field>
          <Button type="submit" variant="secondary">
            {t("apply")}
          </Button>
          <p className="text-body-s text-lava-muted">
            {t("range", { from: range.from, to: range.to })} · {t("rangeHint")}
          </p>
        </form>

        {groups.map((group) => (
          <section key={group.id} aria-labelledby={group.id} className="flex flex-col gap-3">
            <h3 id={group.id} className="text-label uppercase text-lava-muted">
              {group.heading}
            </h3>
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {group.tiles.map((tile) => (
                <div
                  key={tile.label}
                  className="flex flex-col gap-1 rounded-sm border border-divider bg-calce-raised p-4"
                >
                  <dt className="text-body-s text-lava-muted">{tile.label}</dt>
                  <dd className="is-display text-heading-2 tabular-nums">{tile.value}</dd>
                  {tile.detail && <dd className="text-body-s text-lava-muted">{tile.detail}</dd>}
                </div>
              ))}
            </dl>
          </section>
        ))}
      </section>

      <section aria-labelledby="dashboard-prosegui" className="flex flex-col gap-4">
        <h2 id="dashboard-prosegui" className="is-display text-heading-2">
          {t("continueTitle")}
        </h2>
        <div>
          <ButtonLink href="/admin/attivita" variant="secondary">
            {t("continueActivities")}
          </ButtonLink>
        </div>
      </section>
    </section>
  );
}
