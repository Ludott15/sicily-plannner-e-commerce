"use client";

import { useLocale, useTranslations } from "next-intl";
import { ShoppingBag } from "lucide-react";
import { Button, ButtonLink, buttonClass, Popover } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { CartLines } from "./cart-lines";
import { CartSummary } from "./cart-summary";
import type { CartView } from "@/server/shop/cart";

// Icona del carrello nell'intestazione, con il numero di articoli.
// Da md: apre la finestra del carrello (Popover del design system: mini-righe, riepilogo, azioni; sheet
// dal basso su mobile). Sotto md: link alla pagina /carrello. Il conteggio e la vista arrivano dal
// server (layout rivalidato dalle azioni del carrello).
export function CartButton({ count, view }: { count: number; view: CartView }) {
  const t = useTranslations("Cart");
  const locale = useLocale();
  const label = t("openCart", { count });
  const hasLines = view.lines.length > 0;

  const badge =
    count > 0 ? (
      <span
        aria-hidden="true"
        className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-pill bg-coccio px-1 text-caption font-semibold text-on-coccio"
      >
        {count > 9 ? "9+" : count}
      </span>
    ) : null;

  const icon = (
    <>
      <ShoppingBag size={20} strokeWidth={1.5} aria-hidden="true" />
      {badge}
    </>
  );

  return (
    <>
      <ButtonLink href="/carrello" variant="ghost" size="sm" className="relative md:hidden" aria-label={label}>
        {icon}
      </ButtonLink>
      <Popover
        trigger={icon}
        triggerLabel={label}
        triggerClassName={buttonClass("ghost", "sm", "relative hidden md:inline-flex")}
        title={t("title")}
        align="end"
        footer={
          hasLines
            ? (close) => (
                <>
                  <ButtonLink href="/carrello" variant="primary" onClick={close}>
                    {t("goToCart")}
                  </ButtonLink>
                  <Button variant="secondary" onClick={close}>
                    {t("keepShopping")}
                  </Button>
                </>
              )
            : undefined
        }
      >
        {hasLines ? (
          <>
            <CartLines lines={view.lines} locale={locale} compact />
            <CartSummary view={view} locale={locale} />
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="grid size-16 place-items-center rounded-pill bg-calce-sunk text-lava-muted">
              <ShoppingBag size={28} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <p className="text-body">{t("empty")}</p>
            <Link href="/shop" className={buttonClass("secondary", "md")}>
              {t("emptyCta")}
            </Link>
          </div>
        )}
      </Popover>
    </>
  );
}
