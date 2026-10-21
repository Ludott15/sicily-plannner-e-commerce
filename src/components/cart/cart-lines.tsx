"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, Select } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { CART_MAX_QUANTITY } from "@/lib/shop/cart";
import { formatCents, productImageUrl } from "@/lib/shop/present";
import { updateCartLine, type CartActionResult } from "@/server/shop/cart-actions";
import type { CartLine } from "@/server/shop/cart";

// Righe del carrello: quantità modificabile (menu 1..10), rimozione (quantità 0), prezzo di riga IVA inclusa.
// Ogni modifica passa dall'azione del server, che ricalcola e riscrive il cookie; la pagina si aggiorna
// da sola perché l'azione rivalida il layout. L'errore si annuncia con aria-live.
export function CartLines({ lines, locale, compact = false }: { lines: readonly CartLine[]; locale: string; compact?: boolean }) {
  const t = useTranslations("Cart");
  return (
    <ul aria-label={t("items")} className="flex flex-col divide-y divide-divider">
      {lines.map((line) => (
        <CartLineRow key={line.productId} line={line} locale={locale} compact={compact} />
      ))}
    </ul>
  );
}

function CartLineRow({ line, locale, compact }: { line: CartLine; locale: string; compact: boolean }) {
  const t = useTranslations("Cart");
  const tShop = useTranslations("Shop");
  const quantityId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>("");
  const imageUrl = productImageUrl(line.cover);
  const quantities = Array.from({ length: CART_MAX_QUANTITY }, (_, index) => index + 1);

  function save(quantity: number) {
    if (pending) return;
    startTransition(async () => {
      const result: CartActionResult = await updateCartLine({ productId: line.productId, quantity });
      setError(result.status === "error" ? t(`error.${result.code}`) : "");
    });
  }

  return (
    <li className={compact ? "flex gap-3 py-3" : "flex gap-4 py-4"}>
      <div className={compact ? "relative size-16 shrink-0 overflow-hidden rounded-md bg-pistacchio-tint" : "relative size-24 shrink-0 overflow-hidden rounded-md bg-pistacchio-tint"}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-body font-semibold">
          <Link href={`/prodotti/${line.slug}`} className="text-lava underline-offset-4 hover:underline">
            {line.title}
          </Link>
        </p>
        {line.formatLabel && <p className="text-body-s text-lava-muted">{line.formatLabel}</p>}
        <p className="text-body-s text-lava-muted">
          {t("unitPrice", { price: formatCents(line.unitPriceCents, locale) })}
        </p>
        {!compact && (
          <p className="text-body-s text-lava-muted">{tShop("leadTime", { days: line.leadTimeDays })}</p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-3">
          {compact ? (
            // Nella finestra del carrello la quantità è testo: il menu resta sulla pagina del carrello,
            // fuori dal popover con focus trap.
            <>
              <p className="text-body-s font-semibold">{t("quantityTimes", { quantity: line.quantity })}</p>
              <Link href="/carrello" className="text-body-s font-semibold text-coccio-text underline-offset-4 hover:underline">
                {t("editInCart")}
              </Link>
            </>
          ) : (
            <>
              <label htmlFor={quantityId} className="text-body-s font-semibold">
                {t("quantity")}
              </label>
              <Select
                id={quantityId}
                value={String(line.quantity)}
                disabled={pending}
                onValueChange={(value) => save(Number(value))}
                label={`${t("quantity")}: ${line.title}`}
                options={quantities.map((value) => ({ value: String(value), label: String(value) }))}
                className="w-24"
              />
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => save(0)}
            aria-label={t("removeLine", { title: line.title })}
          >
            {t("remove")}
          </Button>
        </div>
        {error && <p role="status" aria-live="polite" className="text-body-s font-semibold text-lava">{error}</p>}
      </div>

      <p className="is-display shrink-0 text-body-l font-semibold">{formatCents(line.lineTotalCents, locale)}</p>
    </li>
  );
}
