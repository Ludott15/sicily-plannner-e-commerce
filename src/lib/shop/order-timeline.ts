import type { OrderStatus } from "./orders";

// Linea temporale dell'ordine per il cliente (passo 7.3): pagato → inoltrato al fornitore → spedito →
// consegnato. Il cliente non vede lo stato interno del fornitore: "inoltrato" si considera avvenuto da
// quando l'ordine è spedito. Funzione pura, senza accessi al server né al browser.

export const TIMELINE_STEPS = ["paid", "forwarded", "shipped", "delivered"] as const;
export type TimelineStep = (typeof TIMELINE_STEPS)[number];

export type TimelineStepState = {
  step: TimelineStep;
  // Il passo è stato raggiunto.
  done: boolean;
  // È il primo passo non ancora raggiunto (il cliente è qui). Nessun passo è "corrente" a ordine chiuso.
  current: boolean;
};

// Stati in cui il pagamento è avvenuto (anche se poi rimborsato).
const PAID_OR_LATER: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "paid",
  "sent_to_producer",
  "shipped",
  "delivered",
  "refunded",
]);

const TERMINAL_WITHOUT_PROGRESS: ReadonlySet<OrderStatus> = new Set<OrderStatus>(["pending", "cancelled", "refunded"]);

export function orderTimeline(status: OrderStatus): TimelineStepState[] {
  const reached: Record<TimelineStep, boolean> = {
    paid: PAID_OR_LATER.has(status),
    forwarded: status === "shipped" || status === "delivered",
    shipped: status === "shipped" || status === "delivered",
    delivered: status === "delivered",
  };
  const stillOpen = !TERMINAL_WITHOUT_PROGRESS.has(status);
  const currentStep = stillOpen ? TIMELINE_STEPS.find((step) => !reached[step]) : undefined;
  return TIMELINE_STEPS.map((step) => ({
    step,
    done: reached[step],
    current: step === currentStep,
  }));
}
