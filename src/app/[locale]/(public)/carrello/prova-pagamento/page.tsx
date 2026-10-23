import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { FakePaymentExpire } from "@/components/cart/fake-payment-expire";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { formatCents } from "@/lib/shop/present";
import { readCart } from "@/server/shop/cart";
import { checkoutMode } from "@/server/shop/checkout-env";

// Pagamento di prova (passo 7.2): esiste solo con CHECKOUT_TEST_PROVIDER=fake e senza VERCEL_ENV,
// altrove risponde 404. Sostituisce la pagina di Stripe negli e2e. L'importo è il totale del carrello:
// con i punti applicati la sessione reale sarebbe più bassa, la prova non ricalcola lo sconto.
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sessione?: string | string[] }>;
};

const FAKE_SESSION = /^cs_fake_([0-9a-f]{32})$/;

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function FakePaymentPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (checkoutMode() !== "fake") notFound();

  const { sessione } = await searchParams;
  if (typeof sessione !== "string") notFound();
  const match = FAKE_SESSION.exec(sessione);
  if (!match) notFound();

  const hex = match[1] ?? "";
  const checkoutId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const [t, view] = await Promise.all([getTranslations("Checkout"), readCart()]);

  return (
    <PageContainer width="prose">
      <PageHeader title={t("fakeTitle")} />
      <p role="note" className="rounded-md bg-calce-sunk p-4 text-body">
        {t("fakeNote")}
      </p>
      <p className="is-display text-display-l">{t("fakeAmount", { amount: formatCents(view.totalCents, locale) })}</p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={`/carrello/esito?sessione=${sessione}`} variant="primary">
          {t("fakePay")}
        </ButtonLink>
        <ButtonLink href="/carrello?annullato=1" variant="secondary">
          {t("fakeCancel")}
        </ButtonLink>
      </div>
      <FakePaymentExpire checkoutId={checkoutId} />
    </PageContainer>
  );
}
