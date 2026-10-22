import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { CheckoutOutcome } from "@/components/cart/checkout-outcome";
import { ClearCart } from "@/components/cart/clear-cart";
import { CartSummary } from "@/components/cart/cart-summary";
import { PageContainer } from "@/components/layout/page-container";
import { redirect } from "@/lib/i18n/navigation";
import { formatCents } from "@/lib/shop/present";
import { readCart } from "@/server/shop/cart";

// Esito del pagamento (passo 7.2). Vale solo con una sessione di pagamento dal provider (cs_test_…,
// cs_live_… o la sessione di prova cs_fake_<32 hex>): senza parametro, o con un formato non valido,
// si torna al carrello senza svuotarlo. Con il 7.3 l'intestazione (CheckoutOutcome) cerca l'ordine della
// sessione e mostra "Pagamento ricevuto" con il numero; se non arriva, resta il testo neutro.
// Solo con una sessione valida il riepilogo mostra il carrello prima dello svuotamento (ClearCart).
const SESSION_ID = /^(?:cs_(?:test|live)_[A-Za-z0-9]{8,}|cs_fake_[0-9a-f]{32})$/;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sessione?: string | string[] }>;
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Checkout" });
  return { title: t("successTitle"), robots: { index: false, follow: false } };
}

export default async function CheckoutSuccessPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { sessione } = await searchParams;
  const sessionId = typeof sessione === "string" && SESSION_ID.test(sessione) ? sessione : "";
  if (!sessionId) redirect({ href: "/carrello", locale });

  const [t, view] = await Promise.all([getTranslations("Checkout"), readCart()]);

  return (
    <PageContainer width="prose">
      <CheckoutOutcome sessionId={sessionId} />

      {view.lines.length > 0 && (
        <section aria-labelledby="esito-riepilogo" className="flex flex-col gap-4">
          <h2 id="esito-riepilogo" className="is-display text-heading-2">
            {t("summary")}
          </h2>
          <ul className="flex flex-col divide-y divide-divider">
            {view.lines.map((line) => (
              <li key={line.productId} className="flex justify-between gap-4 py-3 text-body">
                <span>
                  {line.title} · {line.quantity}×
                </span>
                <span>{formatCents(line.lineTotalCents, locale)}</span>
              </li>
            ))}
          </ul>
          <CartSummary view={view} locale={locale} />
        </section>
      )}

      <ClearCart />
      <ButtonLink href="/shop" variant="secondary" className="self-start">
        {t("backToShop")}
      </ButtonLink>
    </PageContainer>
  );
}
