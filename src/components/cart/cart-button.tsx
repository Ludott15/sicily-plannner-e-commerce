"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShoppingBag } from "lucide-react";
import { Button, ButtonLink } from "@/components/design";
import { Dialog } from "@/components/ui/dialog";
import { CartLines } from "./cart-lines";
import { CartSummary } from "./cart-summary";
import type { CartView } from "@/server/shop/cart";

// Icona del carrello nell'intestazione, con il numero di articoli.
// Da md: apre il drawer laterale con le righe e il riepilogo. Su mobile: link alla pagina /carrello.
// Il conteggio e la vista arrivano dal server (layout rivalidato dalle azioni del carrello).
export function CartButton({ count, view }: { count: number; view: CartView }) {
  const t = useTranslations("Cart");
  const locale = useLocale();
  const [open, setOpen] = useState<boolean>(false);
  const label = t("openCart", { count });

  const badge =
    count > 0 ? (
      <span
        aria-hidden="true"
        className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-pill bg-coccio px-1 text-caption font-semibold text-on-coccio"
      >
        {count > 9 ? "9+" : count}
      </span>
    ) : null;

  return (
    <>
      <ButtonLink href="/carrello" variant="ghost" size="sm" className="relative md:hidden" aria-label={label}>
        <ShoppingBag size={20} strokeWidth={1.5} aria-hidden="true" />
        {badge}
      </ButtonLink>
      <Button
        variant="ghost"
        size="sm"
        className="relative hidden md:inline-flex"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <ShoppingBag size={20} strokeWidth={1.5} aria-hidden="true" />
        {badge}
      </Button>

      <Dialog open={open} title={t("title")} onClose={() => setOpen(false)}>
        {view.lines.length === 0 ? (
          <p className="text-body">{t("empty")}</p>
        ) : (
          <>
            <CartLines lines={view.lines} locale={locale} compact />
            <CartSummary view={view} locale={locale} />
          </>
        )}
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/carrello" variant="primary" onClick={() => setOpen(false)}>
            {t("goToCart")}
          </ButtonLink>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {t("keepShopping")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
