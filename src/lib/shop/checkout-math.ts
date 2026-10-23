import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  MAX_POINTS_DISCOUNT_PERCENT,
  POINTS_PER_EURO,
  shippingCentsFor,
} from "@/lib/shop/config";

// Calcoli del carrello e dei punti, puri (passo 7.2). Il server li usa per la vista del carrello e
// per il checkout; la funzione SQL public.checkout_create applica la stessa regola dei punti
// (100 punti = 1 euro, sconto massimo 15% del subtotale, euro interi) e ha test pgTAP propri.

// Minimo di Stripe per expires_at: 30 minuti. Il margine di 60 secondi evita il rifiuto per l'orologio.
export const CHECKOUT_EXPIRY_SECONDS = 31 * 60;

export type TotalsLine = { lineTotalCents: number; isPerishable: boolean; leadTimeDays: number };

export type CartTotals = {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  freeShippingRemainingCents: number;
  hasPerishable: boolean;
  maxLeadTimeDays: number;
};

// Subtotale IVA inclusa, spedizione per ordine (una tariffa, gratuita dalla soglia), totale.
export function cartTotals(lines: readonly TotalsLine[]): CartTotals {
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  // Senza righe non c'è nulla da spedire: niente tariffa.
  const shippingCents = lines.length === 0 ? 0 : shippingCentsFor(subtotalCents);
  return {
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
    freeShippingRemainingCents: Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - subtotalCents),
    hasPerishable: lines.some((line) => line.isPerishable),
    maxLeadTimeDays: lines.reduce((max, line) => Math.max(max, line.leadTimeDays), 0),
  };
}

export type PointsDiscount = { points: number; discountCents: number };

// Sconto in punti: solo euro interi. Il tetto è MAX_POINTS_DISCOUNT_PERCENT del subtotale
// (arrotondato all'euro inferiore) e il saldo; sotto un euro di sconto non si usa nulla.
export function pointsDiscount(input: { balancePoints: number; subtotalCents: number }): PointsDiscount {
  const { balancePoints, subtotalCents } = input;
  if (!Number.isInteger(balancePoints) || !Number.isInteger(subtotalCents) || balancePoints < 0 || subtotalCents < 0) {
    throw new RangeError("pointsDiscount: saldo e subtotale devono essere interi non negativi");
  }
  const byBalance = Math.floor(balancePoints / POINTS_PER_EURO);
  const byCap = Math.floor((subtotalCents * MAX_POINTS_DISCOUNT_PERCENT) / 10000);
  const euros = Math.min(byBalance, byCap);
  return { points: euros * POINTS_PER_EURO, discountCents: euros * 100 };
}
