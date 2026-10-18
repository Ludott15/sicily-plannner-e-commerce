"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { useRouter } from "@/lib/i18n/navigation";

// Solo con il provider finto (CHECKOUT_TEST_PROVIDER=fake): simula la scadenza della sessione, che
// restituisce i punti tramite il webhook di prova, poi torna al carrello.
export function FakePaymentExpire({ checkoutId }: { checkoutId: string }) {
  const t = useTranslations("Checkout");
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    startTransition(async () => {
      try {
        const response = await fetch("/api/stripe/test-expire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutId }),
        });
        if (!response.ok) {
          setError(t("fakeExpireError"));
          return;
        }
        router.push("/carrello");
      } catch {
        setError(t("fakeExpireError"));
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="ghost" size="sm" disabled={pending} onClick={onClick}>
        {t("fakeExpire")}
      </Button>
      <p role="status" aria-live="polite" className={error ? "text-body-s font-semibold text-lava" : "sr-only"}>
        {error}
      </p>
    </div>
  );
}
