import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { OrderAdminActions, type AdminOrderActions } from "@/components/admin/order-actions";
import { Link } from "@/lib/i18n/navigation";
import { formatCents } from "@/lib/shop/present";
import { parseShippingAddress } from "@/lib/shop/orders";
import { getOrderAdmin } from "@/server/shop/orders.admin";
import {
  clearOrderReviewAction,
  markOrderDeliveredAction,
  markOrderForwardedAction,
  markOrderSupplierConfirmedAction,
  reportOrderProblemAction,
  resendOrderLinkAction,
  shipOrderAction,
} from "@/server/shop/orders-actions.admin";

// Dettaglio di un ordine per l'admin (passo 7.3): cliente e indirizzo, righe con fornitore e costi, importi e
// margine, spedizione e azioni. Le azioni scrivono admin_audit_log dal server; qui si chiamano come prop.

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function AdminOrderPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const order = await getOrderAdmin(id);
  if (!order) notFound();

  const [t, tOrders, format] = await Promise.all([
    getTranslations("AdminOrders"),
    getTranslations("Orders"),
    getFormatter(),
  ]);
  const address = parseShippingAddress(order.shippingAddress);
  const dateTime = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { day: "numeric", month: "long", year: "numeric" }) : null;

  // Le azioni del server, passate come prop al componente client (le pagine admin possono importare *.admin.ts).
  const actions: AdminOrderActions = {
    forward: markOrderForwardedAction,
    supplierConfirmed: markOrderSupplierConfirmedAction,
    ship: shipOrderAction,
    delivered: markOrderDeliveredAction,
    problem: reportOrderProblemAction,
    clearReview: clearOrderReviewAction,
    resendLink: resendOrderLinkAction,
  };

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Link href="/admin/ordini" className="text-body-s font-semibold">
          {t("backToList")}
        </Link>
        <h1 className="is-display text-heading-1">{t("detailTitle", { number: order.orderNumber })}</h1>
        <ul className="flex flex-wrap gap-2">
          <li className="is-tag">{tOrders(`status.${order.status}`)}</li>
          <li className="is-tag">{t(`supplier.${order.supplierStatus}`)}</li>
          {order.needsReview && <li className="is-tag">{t("flagReview")}</li>}
          {order.supplierDelayNotified && <li className="is-tag">{t("flagDelayed")}</li>}
        </ul>
        {order.problemNote && (
          <p className="rounded-sm border-[1.5px] border-danger bg-calce-raised px-4 py-3 text-body">
            {t("problemNoteLabel", { note: order.problemNote })}
          </p>
        )}
      </div>

      <div className="grid gap-10 md:grid-cols-2">
        <section aria-labelledby="order-customer" className="flex flex-col gap-3">
          <h2 id="order-customer" className="is-display text-heading-2">
            {t("customerTitle")}
          </h2>
          <dl className="flex flex-col gap-2 text-body">
            <div>
              <dt className="text-body-s text-lava-muted">{t("email")}</dt>
              <dd className="break-all">{order.email}</dd>
            </div>
            <div>
              <dt className="text-body-s text-lava-muted">{t("phone")}</dt>
              <dd>{address?.phone ?? t("noPhone")}</dd>
            </div>
            <div>
              <dt className="text-body-s text-lava-muted">{t("addressTitle")}</dt>
              <dd>
                {address ? (
                  <address className="not-italic">
                    {address.name && <span className="block">{address.name}</span>}
                    <span className="block">{address.line1}</span>
                    {address.line2 && <span className="block">{address.line2}</span>}
                    <span className="block">
                      {address.postalCode} {address.city}
                      {address.province ? ` (${address.province})` : ""}
                    </span>
                    <span className="block">{address.country}</span>
                  </address>
                ) : (
                  t("addressMissing")
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="order-shipping" className="flex flex-col gap-3">
          <h2 id="order-shipping" className="is-display text-heading-2">
            {t("shippingTitle")}
          </h2>
          <dl className="flex flex-col gap-2 text-body">
            <div>
              <dt className="text-body-s text-lava-muted">{t("forwardedAt")}</dt>
              <dd>{dateTime(order.forwardedAt) ?? t("notYet")}</dd>
            </div>
            <div>
              <dt className="text-body-s text-lava-muted">{t("carrier")}</dt>
              <dd>{order.carrier ?? t("notYet")}</dd>
            </div>
            <div>
              <dt className="text-body-s text-lava-muted">{t("trackingNumber")}</dt>
              <dd className="break-all">{order.trackingNumber ?? t("notYet")}</dd>
            </div>
            {order.trackingUrl && (
              <div>
                <dt className="text-body-s text-lava-muted">{t("trackingUrl")}</dt>
                <dd className="break-all">
                  <a href={order.trackingUrl} rel="noopener noreferrer" className="font-semibold">
                    {order.trackingUrl}
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-body-s text-lava-muted">{t("shippedAt")}</dt>
              <dd>{dateTime(order.shippedAt) ?? t("notYet")}</dd>
            </div>
            <div>
              <dt className="text-body-s text-lava-muted">{t("deliveredAt")}</dt>
              <dd>{dateTime(order.deliveredAt) ?? t("notYet")}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section aria-labelledby="order-lines" className="flex flex-col gap-4">
        <h2 id="order-lines" className="is-display text-heading-2">
          {t("linesTitle")}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-body">
            <thead>
              <tr className="border-b border-divider text-body-s text-lava-muted">
                <th scope="col" className="py-3 pr-4 font-semibold">{t("colProduct")}</th>
                <th scope="col" className="py-3 pr-4 font-semibold">{t("colSupplier")}</th>
                <th scope="col" className="py-3 pr-4 text-right font-semibold">{t("colQuantity")}</th>
                <th scope="col" className="py-3 pr-4 text-right font-semibold">{t("colUnit")}</th>
                <th scope="col" className="py-3 pr-4 text-right font-semibold">{t("colLine")}</th>
                <th scope="col" className="py-3 text-right font-semibold">{t("colCost")}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={`${item.productId}-${index}`} className="border-b border-divider align-top">
                  <td className="py-3 pr-4">
                    <span className="block font-semibold">{item.title}</span>
                    {item.producerName && <span className="block text-body-s text-lava-muted">{item.producerName}</span>}
                    <span className="block text-caption text-lava-muted">{t("vatRate", { rate: item.vatRate })}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="block">{item.supplierName}</span>
                    {item.supplierSku && <span className="block text-body-s text-lava-muted">{item.supplierSku}</span>}
                  </td>
                  <td className="py-3 pr-4 text-right">{item.quantity}</td>
                  <td className="py-3 pr-4 text-right whitespace-nowrap">{formatCents(item.unitPriceCents, locale)}</td>
                  <td className="py-3 pr-4 text-right whitespace-nowrap">{formatCents(item.lineTotalCents, locale)}</td>
                  <td className="py-3 text-right whitespace-nowrap">
                    {item.costCents === null
                      ? t("costMissing")
                      : formatCents(item.costCents * item.quantity, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="order-totals" className="flex flex-col gap-4 md:max-w-xl">
        <h2 id="order-totals" className="is-display text-heading-2">
          {t("totalsTitle")}
        </h2>
        <dl className="flex flex-col gap-2 text-body">
          <div className="flex justify-between gap-4">
            <dt>{t("subtotal")}</dt>
            <dd>{formatCents(order.subtotalCents, locale)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{t("pointsDiscount", { points: order.pointsRedeemed })}</dt>
            <dd>−{formatCents(order.discountCents, locale)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{t("shipping")}</dt>
            <dd>{formatCents(order.shippingCents, locale)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-divider pt-2 font-semibold">
            <dt>{t("total")}</dt>
            <dd>{formatCents(order.totalCents, locale)}</dd>
          </div>
          {order.paidAmountCents !== null && (
            <div className="flex justify-between gap-4">
              <dt>{t("paidAmount")}</dt>
              <dd>{formatCents(order.paidAmountCents, locale)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt>{t("margin")}</dt>
            <dd>{order.marginCents === null ? t("marginMissing") : formatCents(order.marginCents, locale)}</dd>
          </div>
        </dl>
        <p className="text-caption text-lava-muted">
          {t("stripeIds", { session: order.stripeSessionId, payment: order.paymentIntentId ?? "—" })}
        </p>
      </section>

      <OrderAdminActions
        orderId={order.id}
        status={order.status}
        supplierStatus={order.supplierStatus}
        needsReview={order.needsReview}
        actions={actions}
      />
    </section>
  );
}
