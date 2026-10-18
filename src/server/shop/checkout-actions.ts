"use server";

import { z } from "zod";
import { routing } from "@/lib/i18n/routing";
import { publicEnv } from "@/lib/env";
import { getUser } from "@/server/auth";
import { loadCart, readCartState } from "./cart";
import { checkoutMode, stripeSecretKey } from "./checkout-env";
import { fakeGateway, stripeGateway, type CheckoutGateway } from "./checkout-gateway";
import { runCheckout, type CheckoutErrorCode } from "./checkout";
import { checkoutAllowed } from "./checkout-limit";

// Avvio del pagamento (passo 7.2). Il server rilegge carrello e prezzi dal database e crea la sessione;
// il client riceve solo l'URL di pagamento. Senza provider configurato: payments_unavailable.

export type StartCheckoutResult =
  | { status: "ok"; url: string }
  | { status: "error"; code: CheckoutErrorCode | "invalid" | "unavailable" | "rate_limited" };

const startSchema = z.object({
  usePoints: z.boolean(),
  locale: z.enum(routing.locales),
});

function gatewayForMode(): CheckoutGateway | null {
  const mode = checkoutMode();
  if (mode === "fake") return fakeGateway();
  if (mode === "stripe") {
    const key = stripeSecretKey();
    return key ? stripeGateway(key) : null;
  }
  return null;
}

export async function startCheckout(input: { usePoints: boolean; locale: string }): Promise<StartCheckoutResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { usePoints, locale } = parsed.data;

  const user = await getUser();
  if (!(await checkoutAllowed(user?.id ?? null))) return { status: "error", code: "rate_limited" };

  const gateway = gatewayForMode();
  if (!gateway) return { status: "error", code: "payments_unavailable" };

  const state = await readCartState();
  if (!state) return { status: "error", code: "unavailable" };

  const loaded = await loadCart(state.items, locale);

  const outcome = await runCheckout({
    user,
    customerEmail: user && !user.is_anonymous ? (user.email ?? null) : null,
    lines: loaded.view.lines,
    droppedLines: loaded.droppedLines,
    usePoints,
    locale,
    siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
    gateway,
  });

  if (outcome.status === "error") return outcome;
  return { status: "ok", url: outcome.url };
}
