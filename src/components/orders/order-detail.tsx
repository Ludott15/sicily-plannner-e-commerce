import { getFormatter, getTranslations } from "next-intl/server";
import { formatCents } from "@/lib/shop/present";
import type { OrderView } from "@/lib/shop/orders";
import { orderTimeline, type TimelineStep } from "@/lib/shop/order-timeline";

// Dettaglio di un ordine per il cliente (passo 7.3), usato dall'area utente e dal link dell'ospite.
// Server Component. Mostra stato, linea temporale, tracciamento, righe, totali e indirizzo. Nessun costo
// d'acquisto, fornitore o codice del fornitore: la vista (OrderView) non li contiene.

type Props = {
  order: OrderView;
  locale: string;
  guest: boolean;
};

const STEP_DATE_KEY: Record<TimelineStep, "paid" | "shipped" | "delivered" | null> = {
  paid: "paid",
  forwarded: null,
  shipped: "shipped",
  delivered: "delivered",
};

export async function OrderDetail({ order, locale, guest }: Props) {
  const [t, format] = await Promise.all([getTranslations("Orders"), getFormatter()]);
  const steps = orderTimeline(order.status);
  const dates: Record<"paid" | "shipped" | "delivered", string | null> = {
    paid: order.createdAt,
    shipped: order.shippedAt,
    delivered: order.deliveredAt,
  };
  const dateLabel = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { day: "numeric", month: "long", year: "numeric" }) : null;
  const address = order.shippingAddress;
  const hasTracking = order.trackingNumber !== null || order.trackingUrl !== null || order.carrier !== null;
  const isShipped = order.status === "shipped" || order.status === "delivered";

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <section aria-labelledby="order-status" className="flex flex-col gap-4">
        <h2 id="order-status" className="text-heading-3">
          {t("timelineTitle")}
        </h2>
        <p className="text-body font-semibold">{t(`status.${order.status}`)}</p>
        {order.status === "cancelled" || order.status === "refunded" ? (
          <p className="text-body-s text-lava-muted">{t(order.status === "cancelled" ? "cancelledNote" : "refundedNote")}</p>
        ) : (
          <ol className="flex flex-col gap-3" aria-label={t("timelineTitle")}>
            {steps.map(({ step, done, current }) => {
              const dateKey = STEP_DATE_KEY[step];
              const date = dateKey ? dateLabel(dates[dateKey]) : null;
              return (
                <li
                  key={step}
                  aria-current={current ? "step" : undefined}
                  className="flex items-baseline justify-between gap-4 border-b border-divider pb-3"
                >
                  <span className={done || current ? "font-semibold" : "text-lava-muted"}>{t(`step.${step}`)}</span>
                  <span className="text-body-s text-lava-muted">
                    {done && date ? date : done ? t("stepDone") : current ? t("stepCurrent") : t("stepTodo")}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {(hasTracking || isShipped) && (
        <section aria-labelledby="order-tracking" className="flex flex-col gap-4">
          <h2 id="order-tracking" className="text-heading-3">
            {t("trackingTitle")}
          </h2>
          {hasTracking ? (
            <dl className="is-settings">
              {order.carrier && (
                <div className="is-setting">
                  <dt className="is-setting__label">{t("carrier")}</dt>
                  <dd className="is-setting__value">{order.carrier}</dd>
                </div>
              )}
              {order.trackingNumber && (
                <div className="is-setting">
                  <dt className="is-setting__label">{t("trackingNumber")}</dt>
                  <dd className="is-setting__value break-all">{order.trackingNumber}</dd>
                </div>
              )}
              {order.trackingUrl && (
                <div className="is-setting">
                  <dt className="is-setting__label">{t("trackingLink")}</dt>
                  <dd className="is-setting__value">
                    <a
                      href={order.trackingUrl}
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                      className="font-semibold break-all"
                    >
                      {t("trackingOpen")}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-body-s text-lava-muted">{t("trackingPending")}</p>
          )}
        </section>
      )}

      <section aria-labelledby="order-items" className="flex flex-col gap-4">
        <h2 id="order-items" className="text-heading-3">
          {t("itemsTitle")}
        </h2>
        <ul className="flex flex-col divide-y divide-divider">
          {order.items.map((item, index) => (
            <li key={`${item.title}-${index}`} className="flex justify-between gap-4 py-3 text-body">
              <span className="text-pretty">
                {item.title} · {t("quantity", { quantity: item.quantity })}
              </span>
              <span className="shrink-0">{formatCents(item.lineTotalCents, locale)}</span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-2 text-body">
          <div className="flex justify-between gap-4">
            <dt>{t("subtotal")}</dt>
            <dd>{formatCents(order.subtotalCents, locale)}</dd>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between gap-4">
              <dt>{t("pointsDiscount", { points: order.pointsRedeemed })}</dt>
              <dd>−{formatCents(order.discountCents, locale)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt>{t("shipping")}</dt>
            <dd>{order.shippingCents === 0 ? t("shippingFree") : formatCents(order.shippingCents, locale)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-divider pt-3 font-semibold">
            <dt>{t("total")}</dt>
            <dd>{formatCents(order.totalCents, locale)}</dd>
          </div>
        </dl>
        <p className="text-caption text-lava-muted">{t("vatIncluded")}</p>
      </section>

      <section aria-labelledby="order-address" className="flex flex-col gap-4">
        <h2 id="order-address" className="text-heading-3">
          {t("addressTitle")}
        </h2>
        {address ? (
          <address className="text-body not-italic">
            {address.name && <p>{address.name}</p>}
            <p>{address.line1}</p>
            {address.line2 && <p>{address.line2}</p>}
            <p>
              {address.postalCode} {address.city}
              {address.province ? ` (${address.province})` : ""}
            </p>
            <p>{address.country}</p>
          </address>
        ) : (
          <p className="text-body-s text-lava-muted">{t("addressMissing")}</p>
        )}
      </section>

      {guest && <p className="text-body-s text-lava-muted">{t("guestNote")}</p>}
    </div>
  );
}
