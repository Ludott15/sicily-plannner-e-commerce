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

export type VatBuckets = Record<"4" | "10" | "22", VatBucket>;

export type VatLine = { totalCents: number; vatRate: number };

// Ripartizione di un importo intero in quote proporzionali ai pesi, con il metodo dei resti più grandi:
// ogni quota è la parte intera della proporzione, e i centesimi rimasti vanno ai resti più grandi (a parità,
// la riga precedente). La somma delle quote è sempre esattamente total.
export function allocateProportionally(weights: readonly number[], total: number): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError("allocateProportionally: il totale deve essere un intero non negativo");
  }
  if (weights.some((weight) => !Number.isInteger(weight) || weight < 0)) {
    throw new RangeError("allocateProportionally: i pesi devono essere interi non negativi");
  }
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum === 0) {
    if (total !== 0) throw new RangeError("allocateProportionally: nessun peso per ripartire un importo");
    return weights.map(() => 0);
  }
  // Aritmetica intera: il quoziente e il resto della divisione, senza errori di virgola mobile.
  const parts = weights.map((weight) => {
    const product = weight * total;
    const quotient = Math.floor(product / weightSum);
    return { quotient, remainder: product - quotient * weightSum };
  });
  let left = total - parts.reduce((sum, part) => sum + part.quotient, 0);
  const byRemainder = parts
    .map((part, index) => ({ index, remainder: part.remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const result = parts.map((part) => part.quotient);
  for (const candidate of byRemainder) {
    if (left === 0) break;
    result[candidate.index] = (result[candidate.index] ?? 0) + 1;
    left -= 1;
  }
  return result;
}

// Sconto punti ripartito sulle righe in proporzione al loro valore (IVA inclusa), con i resti più grandi.
export function allocateDiscount(lines: readonly VatLine[], discountCents: number): number[] {
  return allocateProportionally(
    lines.map((line) => line.totalCents),
    discountCents,
  );
}

function emptyBuckets(): VatBuckets {
  return {
    "4": { netCents: 0, vatCents: 0 },
    "10": { netCents: 0, vatCents: 0 },
    "22": { netCents: 0, vatCents: 0 },
  };
}

function rateKey(vatRate: number): keyof VatBuckets {
  const key = String(vatRate);
  if (key !== "4" && key !== "10" && key !== "22") {
    throw new RangeError("aliquota IVA non prevista");
  }
  return key;
}

// Imponibile e IVA per aliquota delle righe, con l'IVA calcolata DOPO lo sconto punti. Lo sconto si ripartisce
// sulle righe in proporzione al valore e con i resti più grandi (allocateDiscount); ogni riga scompone il suo
// lordo scontato in imponibile e IVA. Le tre aliquote sono sempre presenti.
export function vatBreakdown(lines: readonly VatLine[], discountCents = 0): VatBuckets {
  const discounts = allocateDiscount(lines, discountCents);
  const buckets = emptyBuckets();
  lines.forEach((line, index) => {
    const key = rateKey(line.vatRate);
    const grossAfterDiscount = line.totalCents - (discounts[index] ?? 0);
    const split = vatSplit(grossAfterDiscount, line.vatRate);
    buckets[key].netCents += split.netCents;
    buckets[key].vatCents += split.vatCents;
  });
  return buckets;
}

// Come vatBreakdown, più la spedizione. La spedizione è un'operazione accessoria (art. 12 DPR 633/72) e segue
// l'aliquota dei beni: si ripartisce tra le aliquote in proporzione all'imponibile dei beni di ciascuna
// (dopo lo sconto), con i resti più grandi, e su ogni quota si scorpora l'IVA. Così per ogni ordine
// la somma di imponibile e IVA di tutte le aliquote è uguale al totale incassato.
export function orderVatBreakdown(input: {
  lines: readonly VatLine[];
  discountCents: number;
  shippingCents: number;
}): VatBuckets {
  const buckets = vatBreakdown(input.lines, input.discountCents);
  const keys: (keyof VatBuckets)[] = ["4", "10", "22"];
  const shares = allocateProportionally(
    keys.map((key) => buckets[key].netCents),
    input.shippingCents,
  );
  keys.forEach((key, index) => {
    const split = vatSplit(shares[index] ?? 0, Number(key));
    buckets[key].netCents += split.netCents;
    buckets[key].vatCents += split.vatCents;
  });
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
