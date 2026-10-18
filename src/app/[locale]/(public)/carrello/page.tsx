import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShoppingBag } from "lucide-react";
import { CartLines } from "@/components/cart/cart-lines";
import { CartSummary } from "@/components/cart/cart-summary";
import { CheckoutPanel } from "@/components/cart/checkout-panel";
import { ButtonLink } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { getUser } from "@/server/auth";
import { readCart } from "@/server/shop/cart";
import { readPointsOffer } from "@/server/shop/checkout";
import { cartSecret, checkoutMode } from "@/server/shop/checkout-env";

// Carrello (passo 7.2). Pagina piena su mobile e di ripiego da desktop; non si indicizza.
// I prezzi sono quelli del database a ogni richiesta. La casella dei punti c'è solo per chi ha un account.
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ annullato?: string | string[] }>;
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Cart" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function CartPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { annullato } = await searchParams;
  const canceled = annullato === "1";

  const [t, view, user] = await Promise.all([getTranslations("Cart"), readCart(), getUser()]);
  const enabled = cartSecret() !== null;
  const member = user !== null && !user.is_anonymous;
  const points = member ? await readPointsOffer(user, view.subtotalCents) : null;
  const payable = checkoutMode() !== "off";

  return (
    <PageContainer width="wide">
      <PageHeader title={t("title")} />

      {canceled && (
        <p role="status" className="rounded-md bg-calce-sunk p-4 text-body">
          {t("canceled")}
        </p>
      )}

      {!enabled ? (
        <p role="status" className="text-body-l">
          {t("unavailable")}
        </p>
      ) : view.lines.length === 0 ? (
        <div className="flex flex-col items-start gap-4 py-8">
          <ShoppingBag size={40} strokeWidth={1.5} aria-hidden="true" className="text-lava-muted" />
          <p className="text-body-l">{t("empty")}</p>
          <ButtonLink href="/shop" variant="primary">
            {t("emptyCta")}
          </ButtonLink>
        </div>
      ) : (
        <div className="grid gap-10 md:grid-cols-12 md:gap-12">
          <section aria-labelledby="carrello-articoli" className="flex flex-col gap-4 md:col-span-7">
            <h2 id="carrello-articoli" className="is-display text-heading-2">
              {t("items")}
            </h2>
            <CartLines lines={view.lines} locale={locale} />
          </section>

          <aside
            aria-label={t("summary")}
            className="flex flex-col gap-6 rounded-lg border border-card-edge bg-calce-raised p-6 md:sticky md:top-8 md:col-span-5 md:self-start"
          >
            <CartSummary view={view} locale={locale} />
            <CheckoutPanel locale={locale} payable={payable} points={points} />
          </aside>
        </div>
      )}
    </PageContainer>
  );
}
