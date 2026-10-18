import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { ClearCart } from "@/components/cart/clear-cart";
import { CartSummary } from "@/components/cart/cart-summary";
import { PageContainer } from "@/components/layout/page-container";
import { formatCents } from "@/lib/shop/present";
import { readCart } from "@/server/shop/cart";

// Esito del pagamento (passo 7.2). Il riepilogo mostra il carrello com'è prima dello svuotamento:
// il numero d'ordine non c'è ancora (arriva con il passo 7.3), quindi il testo non ne promette uno.
// ClearCart svuota il carrello al primo montaggio.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Checkout" });
  return { title: t("successTitle"), robots: { index: false, follow: false } };
}

export default async function CheckoutSuccessPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, view] = await Promise.all([getTranslations("Checkout"), readCart()]);

  return (
    <PageContainer width="prose">
      <header className="flex flex-col gap-3">
        <h1 className="is-display text-heading-1 md:text-display-l">{t("successTitle")}</h1>
        <p className="text-body-l">{t("successBody")}</p>
      </header>

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
