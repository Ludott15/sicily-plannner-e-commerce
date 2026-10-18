"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/design";
import { CART_MAX_QUANTITY } from "@/lib/shop/cart";
import { addToCart, type CartErrorCode } from "@/server/shop/cart-actions";

// "Aggiungi al carrello" (ProductCard e pagina prodotto). Il form parte da onSubmit con startTransition:
// l'azione non cancella il campo quantità se risponde con un errore. L'esito si annuncia con aria-live.
// La quantità (1..10) è un menu solo nella pagina prodotto; nella card è sempre 1.

type Status = { kind: "idle" } | { kind: "added" } | { kind: "error"; code: CartErrorCode };

export function AddToCart({
  productId,
  productTitle,
  variant = "secondary",
  size = "sm",
  withQuantity = false,
  fullWidth = false,
}: {
  productId: string;
  // Nome del prodotto, per il nome accessibile del campo quantità.
  productTitle: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  withQuantity?: boolean;
  fullWidth?: boolean;
}) {
  const t = useTranslations("Cart");
  const quantityId = useId();
  const [quantity, setQuantity] = useState<number>(1);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const quantities = Array.from({ length: CART_MAX_QUANTITY }, (_, index) => index + 1);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    startTransition(async () => {
      const result = await addToCart({ productId, quantity });
      setStatus(result.status === "ok" ? { kind: "added" } : { kind: "error", code: result.code });
    });
  }

  const message =
    status.kind === "added" ? t("added") : status.kind === "error" ? t(`error.${status.code}`) : "";

  return (
    <form onSubmit={onSubmit} className={fullWidth ? "flex w-full flex-col gap-3" : "flex flex-col items-start gap-2"}>
      <div className={withQuantity ? "flex flex-wrap items-end gap-3" : "contents"}>
        {withQuantity && (
          <div className="flex flex-col gap-1">
            <label htmlFor={quantityId} className="text-body-s font-semibold">
              {t("quantity")}
            </label>
            <select
              id={quantityId}
              name="quantity"
              value={quantity}
              disabled={pending}
              onChange={(event) => {
                setQuantity(Number(event.currentTarget.value));
                setStatus({ kind: "idle" });
              }}
              aria-label={`${t("quantity")}: ${productTitle}`}
              className="min-h-11 rounded-md border border-card-edge bg-calce-raised px-3 text-body text-lava focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {quantities.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" variant={variant} size={size} disabled={pending} className={fullWidth ? "w-full" : undefined}>
          {pending ? t("adding") : t("addToCart")}
        </Button>
      </div>
      <p role="status" aria-live="polite" className={message ? "text-body-s text-lava-muted" : "sr-only"}>
        {message}
      </p>
    </form>
  );
}
