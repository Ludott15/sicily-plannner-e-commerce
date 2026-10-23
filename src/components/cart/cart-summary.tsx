import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { formatCents } from "@/lib/shop/present";
import type { CartView } from "@/server/shop/cart";

// Riepilogo del carrello: subtotale, spedizione (una tariffa per ordine, gratuita dalla soglia), totale,
// quanto manca alla spedizione gratuita, tempi del fornitore, avviso per i deperibili e link alle condizioni.
// Componente senza stato: lo usano la pagina del carrello e il drawer.
export function CartSummary({ view, locale }: { view: CartView; locale: string }) {
  const t = useTranslations("Cart");
  const hasLines = view.lines.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-2 text-body">
        <div className="flex justify-between gap-4">
          <dt>{t("subtotal")}</dt>
          <dd>{formatCents(view.subtotalCents, locale)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{t("shipping")}</dt>
          <dd>{hasLines && view.shippingCents === 0 ? t("shippingFree") : formatCents(view.shippingCents, locale)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-divider pt-3 text-body-l font-semibold">
          <dt>{t("total")}</dt>
          <dd className="is-display">{formatCents(view.totalCents, locale)}</dd>
        </div>
      </dl>
      <p className="text-body-s text-lava-muted">{t("vatIncluded")}</p>

      {hasLines && view.freeShippingRemainingCents > 0 && (
        <p className="text-body-s">
          {t("shippingFreeRemaining", { amount: formatCents(view.freeShippingRemainingCents, locale) })}
        </p>
      )}
      {hasLines && (
        <p className="text-body-s">{t("leadTimeNote", { days: view.maxLeadTimeDays })}</p>
      )}
      {view.hasPerishable && (
        <p role="note" className="rounded-md bg-calce-sunk p-3 text-body-s">
          {t("perishableInCart")}
        </p>
      )}
      <p className="text-body-s text-lava-muted">
        {t.rich("termsNote", {
          link: (chunks) => (
            <Link href="/condizioni-di-vendita" className="text-lava underline-offset-4 hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
