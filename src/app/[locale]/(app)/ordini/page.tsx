import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { ButtonLink } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { formatCents } from "@/lib/shop/present";
import { Link } from "@/lib/i18n/navigation";
import { requireUser } from "@/server/auth";
import { listMyOrders } from "@/server/shop/orders";

// I miei ordini (passo 7.3): gli ordini dell'account, il più recente per primo. Solo l'utente loggato
// (il layout di (app) chiede il login); la RLS restituisce solo i suoi ordini.

type Props = { params: Promise<{ locale: string }> };

export default async function MyOrdersPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();

  const [t, format, orders] = await Promise.all([
    getTranslations("Orders"),
    getFormatter(),
    listMyOrders(user),
  ]);

  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("intro")} />

      {orders.length === 0 ? (
        <section aria-labelledby="orders-empty" className="flex flex-col items-start gap-4">
          <h2 id="orders-empty" className="text-heading-3">
            {t("emptyTitle")}
          </h2>
          <p className="text-body text-lava-muted">{t("emptyBody")}</p>
          <ButtonLink href="/shop" variant="primary">
            {t("emptyCta")}
          </ButtonLink>
        </section>
      ) : (
        <ul className="is-settings" aria-label={t("title")}>
          {orders.map((order) => (
            <li key={order.orderNumber}>
              <Link href={`/ordini/${order.orderNumber}`} className="is-setting">
                <span className="is-setting__label">{order.orderNumber}</span>
                <span className="is-setting__value">
                  {t(`status.${order.status}`)} ·{" "}
                  {format.dateTime(new Date(order.createdAt), { day: "numeric", month: "long", year: "numeric" })} ·{" "}
                  {formatCents(order.totalCents, locale)}
                </span>
                <ChevronRight aria-hidden="true" className="is-setting__action size-5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
