import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { OrderDetail } from "@/components/orders/order-detail";
import { OrderTokenCleaner } from "@/components/orders/order-token-cleaner";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { isOrderNumber, type OrderView } from "@/lib/shop/orders";
import { requireUser } from "@/server/auth";
import { getGuestOrder, getMyOrder } from "@/server/shop/orders";

// Dettaglio di un ordine (passo 7.3). Due accessi:
// - con ?t=<token> (il link dell'email, anche senza account): getGuestOrder. Il token è nel link, non nel
//   percorso; nessun dato se il token non coincide;
// - senza token: l'ordine dell'account loggato (getMyOrder, con la RLS).
// La pagina è nel gruppo (public) perché l'ospite la apre senza login; l'accesso dell'account è chiesto qui.
// Non si indicizza e il referrer non si invia (Referrer-Policy no-referrer tramite il metadata).

type Props = {
  params: Promise<{ locale: string; numero: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
};

// Niente indicizzazione e nessun referrer: il link dell'ospite non deve finire nei log di terzi.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function OrderPage({ params, searchParams }: Props) {
  const { locale, numero } = await params;
  setRequestLocale(locale);
  if (!isOrderNumber(numero)) notFound();

  const { t: tokenParam } = await searchParams;
  const token = typeof tokenParam === "string" ? tokenParam : null;

  let order: OrderView | null;
  let guest: boolean;
  if (token !== null) {
    guest = true;
    order = await getGuestOrder(numero, token);
  } else {
    guest = false;
    const user = await requireUser();
    order = await getMyOrder(user, numero);
  }
  if (!order) notFound();

  const [t, format] = await Promise.all([getTranslations("Orders"), getFormatter()]);
  const placed = format.dateTime(new Date(order.createdAt), { day: "numeric", month: "long", year: "numeric" });
  return (
    <PageContainer>
      <PageHeader title={t("orderTitle", { number: order.orderNumber })} subtitle={t("placedOn", { date: placed })} />
      <OrderDetail order={order} locale={locale} guest={guest} />
      {guest && <OrderTokenCleaner />}
    </PageContainer>
  );
}
