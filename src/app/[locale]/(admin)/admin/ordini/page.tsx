import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { buttonClass } from "@/components/design";
import { DateInput, Field, Select } from "@/components/admin/fields";
import { Link } from "@/lib/i18n/navigation";
import { formatCents } from "@/lib/shop/present";
import { ORDER_STATUSES, SUPPLIER_STATUSES, type OrderStatus, type SupplierStatus } from "@/lib/shop/orders";
import { listOrdersAdmin, type AdminOrderFilter } from "@/server/shop/orders.admin";

// Ordini (passo 7.3): elenco con filtri per stato, stato del fornitore e attenzione (da inoltrare a mano,
// revisione, in ritardo), ed esportazione CSV per il commercialista. Solo admin (il layout risponde 404).
// I filtri sono parametri GET: un link o un ricaricamento mantiene la vista.

const ATTENTION = ["review", "to_forward", "delayed"] as const;
type Attention = (typeof ATTENTION)[number];

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stato?: string | string[]; fornitore?: string | string[]; attenzione?: string | string[] }>;
};

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

export default async function AdminOrdersPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const status = pick<OrderStatus>(single(query.stato), ORDER_STATUSES);
  const supplierStatus = pick<SupplierStatus>(single(query.fornitore), SUPPLIER_STATUSES);
  const attention: Attention | undefined = pick(single(query.attenzione), ATTENTION);
  const filter: AdminOrderFilter = { status, supplierStatus, attention, limit: 100 };
  const filtered = status !== undefined || supplierStatus !== undefined || attention !== undefined;

  const [t, tOrders, format, rows] = await Promise.all([
    getTranslations("AdminOrders"),
    getTranslations("Orders"),
    getFormatter(),
    listOrdersAdmin(filter),
  ]);

  const statusOptions = [
    { value: "", label: t("all") },
    ...ORDER_STATUSES.map((value) => ({ value, label: tOrders(`status.${value}`) })),
  ];
  const supplierOptions = [
    { value: "", label: t("all") },
    ...SUPPLIER_STATUSES.map((value) => ({ value, label: t(`supplier.${value}`) })),
  ];
  const attentionLinks: { key: Attention; label: string }[] = [
    { key: "to_forward", label: t("attentionToForward") },
    { key: "review", label: t("attentionReview") },
    { key: "delayed", label: t("attentionDelayed") },
  ];

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("title")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("intro")}</p>
      </div>

      <nav aria-label={t("attentionLabel")} className="flex flex-wrap gap-3">
        <Link
          href="/admin/ordini"
          className={buttonClass(attention === undefined ? "primary" : "secondary", "sm")}
          aria-current={attention === undefined ? "page" : undefined}
        >
          {t("attentionAll")}
        </Link>
        {attentionLinks.map((link) => (
          <Link
            key={link.key}
            href={`/admin/ordini?attenzione=${link.key}`}
            className={buttonClass(attention === link.key ? "primary" : "secondary", "sm")}
            aria-current={attention === link.key ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <form method="get" action={`/${locale}/admin/ordini`} className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <Field label={t("filterStatus")} htmlFor="orders-filter-status">
          <Select id="orders-filter-status" name="stato" defaultValue={status ?? ""}>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("filterSupplier")} htmlFor="orders-filter-supplier">
          <Select id="orders-filter-supplier" name="fornitore" defaultValue={supplierStatus ?? ""}>
            {supplierOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("filterAttention")} htmlFor="orders-filter-attention">
          <Select id="orders-filter-attention" name="attenzione" defaultValue={attention ?? ""}>
            <option value="">{t("all")}</option>
            {attentionLinks.map((link) => (
              <option key={link.key} value={link.key}>
                {link.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-3">
          <button type="submit" className={buttonClass("primary")}>
            {t("filter")}
          </button>
          {filtered && (
            <Link href="/admin/ordini" className={buttonClass("ghost")}>
              {t("clearFilters")}
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-card-edge bg-calce-raised p-6 text-body">
          {filtered ? t("emptyFiltered") : t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-body">
            <caption className="sr-only">{t("title")}</caption>
            <thead>
              <tr className="border-b border-divider text-body-s text-lava-muted">
                <th scope="col" className="py-3 pr-4 font-semibold">{t("colNumber")}</th>
                <th scope="col" className="py-3 pr-4 font-semibold">{t("colDate")}</th>
                <th scope="col" className="py-3 pr-4 font-semibold">{t("colEmail")}</th>
                <th scope="col" className="py-3 pr-4 font-semibold">{t("colStatus")}</th>
                <th scope="col" className="py-3 pr-4 font-semibold">{t("colSupplier")}</th>
                <th scope="col" className="py-3 pr-4 text-right font-semibold">{t("colTotal")}</th>
                <th scope="col" className="py-3 font-semibold">{t("colFlags")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-divider align-top">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/ordini/${row.id}`} className="font-semibold">
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {format.dateTime(new Date(row.createdAt), { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="py-3 pr-4 break-all">{row.email}</td>
                  <td className="py-3 pr-4">{tOrders(`status.${row.status}`)}</td>
                  <td className="py-3 pr-4">{t(`supplier.${row.supplierStatus}`)}</td>
                  <td className="py-3 pr-4 text-right whitespace-nowrap">{formatCents(row.totalCents, locale)}</td>
                  <td className="py-3">
                    <ul className="flex flex-wrap gap-2">
                      {row.toForwardByHand && <li className="is-tag">{t("flagToForward")}</li>}
                      {row.needsReview && <li className="is-tag">{t("flagReview")}</li>}
                      {row.supplierDelayNotified && <li className="is-tag">{t("flagDelayed")}</li>}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section aria-labelledby="orders-export" className="flex flex-col gap-4 rounded-lg border border-card-edge bg-calce-raised p-6">
        <div className="flex flex-col gap-2">
          <h2 id="orders-export" className="text-heading-3">
            {t("exportTitle")}
          </h2>
          <p className="text-body-s text-lava-muted">{t("exportIntro")}</p>
        </div>
        <form method="get" action={`/${locale}/admin/ordini/esporta`} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label={t("exportFrom")} htmlFor="orders-export-from">
            <DateInput id="orders-export-from" name="from" required />
          </Field>
          <Field label={t("exportTo")} htmlFor="orders-export-to" hint={t("exportHint")}>
            <DateInput id="orders-export-to" name="to" required />
          </Field>
          <button type="submit" className={buttonClass("primary")}>
            {t("exportButton")}
          </button>
        </form>
      </section>
    </section>
  );
}
