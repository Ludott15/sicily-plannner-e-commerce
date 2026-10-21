import { z } from "zod";
import { POINTS_EARNED_PER_EURO } from "./config";

// Funzioni pure degli ordini (passo 7.3): numero, punti a consegna, importi attesi da Stripe, IVA per
// aliquota, link alla pagina dell'ordine. Nessun accesso a database né al server: si testano da sole.
// Il numero d'ordine lo assegna il database (public.next_order_number, formato ISU-AAAA-NNNNNN).

export const ORDER_NUMBER_PATTERN = /^ISU-\d{4}-\d{6}$/;

export function isOrderNumber(value: string): boolean {
  return ORDER_NUMBER_PATTERN.test(value);
}

// Stato che vede il cliente (colonna orders.status, enum order_status). "sent_to_producer" è il valore del
// modello precedente (per produttore): il passo 7.3 non lo scrive più, ma l'enum lo contiene ancora.
export const ORDER_STATUSES = [
  "pending",
  "paid",
  "sent_to_producer",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Stato dell'inoltro al fornitore (colonna orders.supplier_status).
export const SUPPLIER_STATUSES = ["pending", "forwarded", "confirmed", "shipped", "delivered", "problem"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

// Punti guadagnati per il totale pagato: un punto per euro intero (ordini consegnati, una sola volta).
export function pointsEarnedForTotal(totalCents: number): number {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new RangeError("pointsEarnedForTotal: il totale deve essere un intero non negativo");
  }
  return Math.floor(totalCents / 100) * POINTS_EARNED_PER_EURO;
}

// Totale atteso da Stripe per lo snapshot del checkout: subtotale − sconto punti + spedizione.
// Tutti in centesimi IVA inclusa. È lo stesso vincolo orders_total_consistent del database.
export function expectedPaidCents(input: { subtotalCents: number; discountCents: number; shippingCents: number }): number {
  return input.subtotalCents - input.discountCents + input.shippingCents;
}

// Scomposizione IVA di un importo lordo (IVA inclusa) con aliquota 4, 10 o 22. Il netto arrotonda al
// centesimo più vicino; l'IVA è la differenza, così lordo = netto + IVA sempre.
export function vatSplit(grossCents: number, vatRate: number): { netCents: number; vatCents: number } {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new RangeError("vatSplit: l'importo deve essere un intero non negativo");
  }
  const netCents = Math.round((grossCents * 100) / (100 + vatRate));
  return { netCents, vatCents: grossCents - netCents };
}

export type VatBucket = { netCents: number; vatCents: number };

// Somma per aliquota delle righe (lordo per riga), con le tre aliquote sempre presenti.
export function vatBreakdown(lines: readonly { totalCents: number; vatRate: number }[]): Record<"4" | "10" | "22", VatBucket> {
  const buckets: Record<"4" | "10" | "22", VatBucket> = {
    "4": { netCents: 0, vatCents: 0 },
    "10": { netCents: 0, vatCents: 0 },
    "22": { netCents: 0, vatCents: 0 },
  };
  for (const line of lines) {
    const key = String(line.vatRate);
    if (key !== "4" && key !== "10" && key !== "22") {
      throw new RangeError("vatBreakdown: aliquota non prevista");
    }
    const split = vatSplit(line.totalCents, line.vatRate);
    buckets[key].netCents += split.netCents;
    buckets[key].vatCents += split.vatCents;
  }
  return buckets;
}

export type OrderPageUrlInput = {
  siteUrl: string;
  locale: string;
  orderNumber: string;
  // Solo per gli ospiti: il token del link dell'email. Gli account non lo usano.
  accessToken?: string | null;
};

// Pagina dell'ordine: /<lingua>/ordini/<numero>, con ?t=<token> per l'ospite.
export function orderPageUrl(input: OrderPageUrlInput): string {
  if (!isOrderNumber(input.orderNumber)) {
    throw new RangeError("orderPageUrl: numero d'ordine non valido");
  }
  const base = input.siteUrl.replace(/\/+$/, "");
  const query = input.accessToken ? `?t=${encodeURIComponent(input.accessToken)}` : "";
  return `${base}/${input.locale}/ordini/${input.orderNumber}${query}`;
}

// Cosa il cliente vede di un ordine (account o ospite). Nessun costo, fornitore o codice del fornitore.
export type OrderItemView = {
  title: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  lineTotalCents: number;
};

export type OrderShippingAddressView = {
  name: string | null;
  phone: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  country: string;
};

// Indirizzo dal JSON della colonna orders.shipping_address (chiavi camelCase, scritte dal webhook).
// Un valore che non rispetta la forma dà null: la pagina lo mostra come "indirizzo non disponibile".
const shippingAddressSchema = z.object({
  name: z.string().nullable(),
  phone: z.string().nullable(),
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  province: z.string().nullable(),
  country: z.string(),
});

export function parseShippingAddress(value: unknown): OrderShippingAddressView | null {
  const parsed = shippingAddressSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type OrderView = {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  pointsRedeemed: number;
  shippingAddress: OrderShippingAddressView | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  items: OrderItemView[];
};
