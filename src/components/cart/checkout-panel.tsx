"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button, PendingButton } from "@/components/design";
import { MAX_POINTS_DISCOUNT_PERCENT, POINTS_PER_EURO } from "@/lib/shop/config";
import { formatCents } from "@/lib/shop/present";
import { startCheckout, type StartCheckoutResult } from "@/server/shop/checkout-actions";
import type { PointsOffer } from "@/server/shop/checkout";

// Pagamento: casella dei punti (solo per chi ha un account, con il calcolo del tetto e del saldo) e
// pulsante "Paga con Stripe". Il form parte da onSubmit con startTransition. Con i pagamenti spenti
// (payable false) il pulsante è in sospeso (PendingButton "checkout.pay"): il carrello resta com'è.
// Con la risposta ok il browser va all'URL del provider; gli errori mappano al messaggio del codice.
export function CheckoutPanel({
  locale,
  payable,
  points,
}: {
  locale: string;
  payable: boolean;
  // Null per gli ospiti: nessuna casella dei punti.
  points: PointsOffer | null;
}) {
  const t = useTranslations("Checkout");
  const pointsId = useId();
  const errorId = useId();
  const [usePoints, setUsePoints] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const canUsePoints = points !== null && points.points > 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    startTransition(async () => {
      const result: StartCheckoutResult = await startCheckout({ usePoints: canUsePoints && usePoints, locale });
      if (result.status === "ok") {
        window.location.assign(result.url);
        return;
      }
      setError(t(`error.${result.code}`));
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-describedby={error ? errorId : undefined}>
      {points !== null && (
        <div className="flex flex-col gap-2 rounded-md border border-divider p-4">
          <p className="text-body font-semibold">{t("pointsTitle")}</p>
          {canUsePoints ? (
            <>
              <label htmlFor={pointsId} className="flex min-h-11 items-start gap-3 text-body">
                <input
                  id={pointsId}
                  type="checkbox"
                  checked={usePoints}
                  disabled={pending || !payable}
                  onChange={(event) => setUsePoints(event.currentTarget.checked)}
                  className="mt-1 size-5 shrink-0 accent-coccio"
                />
                <span>
                  {t("pointsUse", {
                    points: points.points,
                    discount: formatCents(points.discountCents, locale),
                  })}
                </span>
              </label>
              <p className="text-body-s text-lava-muted">
                {t("pointsBalance", { balance: points.balancePoints })} {t("pointsCap", { percent: MAX_POINTS_DISCOUNT_PERCENT })}
              </p>
            </>
          ) : (
            <p className="text-body-s text-lava-muted">
              {t("pointsBalance", { balance: points.balancePoints })} {t("pointsNotEnough", { points: POINTS_PER_EURO })}
            </p>
          )}
        </div>
      )}

      {payable ? (
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? t("redirecting") : t("payWithStripe")}
        </Button>
      ) : (
        <>
          <PendingButton id="checkout.pay" variant="primary" fullWidth>
            {t("payWithStripe")}
          </PendingButton>
          <p className="text-body-s text-lava-muted">{t("paymentsSoon")}</p>
        </>
      )}

      <p id={errorId} role="status" aria-live="polite" className={error ? "text-body-s font-semibold text-lava" : "sr-only"}>
        {error}
      </p>
    </form>
  );
}
