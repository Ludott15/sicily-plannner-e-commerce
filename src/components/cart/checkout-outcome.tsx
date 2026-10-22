"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { checkoutOrderStatusAction } from "@/server/shop/checkout-order-actions";

// Intestazione della pagina di esito (passo 7.3). Il webhook di Stripe crea l'ordine con un piccolo ritardo:
// si chiede al server ogni 2 secondi, per al massimo 20 secondi. Con l'ordine trovato il titolo diventa
// "Pagamento ricevuto" con il numero e il link; se non arriva, resta il testo neutro. Il primo render è
// sempre "checking", uguale sul server e sul client (nessun mismatch di idratazione).

export const CHECKOUT_POLL_INTERVAL_MS = 2000;
export const CHECKOUT_POLL_LIMIT_MS = 20000;

type Phase = { status: "checking" } | { status: "found"; orderNumber: string } | { status: "timeout" };

export function CheckoutOutcome({ sessionId }: { sessionId: string }) {
  const t = useTranslations("Checkout");
  const [phase, setPhase] = useState<Phase>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function poll(): Promise<void> {
      try {
        const result = await checkoutOrderStatusAction(sessionId);
        if (cancelled) return;
        if (result.status === "found") {
          setPhase({ status: "found", orderNumber: result.orderNumber });
          return;
        }
      } catch {
        // Un errore di rete o del server non interrompe il polling: si riprova fino al limite.
      }
      if (cancelled) return;
      if (Date.now() - startedAt >= CHECKOUT_POLL_LIMIT_MS) {
        setPhase({ status: "timeout" });
        return;
      }
      timer = setTimeout(() => void poll(), CHECKOUT_POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  if (phase.status === "found") {
    return (
      <header className="flex flex-col gap-3">
        <h1 className="is-display text-heading-1 md:text-display-l">{t("orderReceived")}</h1>
        <p className="text-body-l">{t("orderNumber", { number: phase.orderNumber })}</p>
        <p>
          <Link href={`/ordini/${phase.orderNumber}`} className="font-semibold">
            {t("orderLink")}
          </Link>
        </p>
      </header>
    );
  }

  return (
    <header className="flex flex-col gap-3">
      <h1 className="is-display text-heading-1 md:text-display-l">{t("successTitle")}</h1>
      <p className="text-body-l" role="status">
        {phase.status === "checking" ? t("successPending") : t("successBody")}
      </p>
    </header>
  );
}
