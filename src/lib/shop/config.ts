// Parametri dello shop, in un solo punto. Il modello è quello di un intermediario: il prodotto
// si compra da un fornitore che lo spedisce al cliente, Isula incassa e segue l'ordine
// (docs/spec.md, sezione E-commerce). Valori reversibili: cambiarli qui, e nei test.

// Spedizione solo in Italia nella prima versione.
export const SHIPPING_COUNTRIES = ["IT"] as const;
export type ShippingCountry = (typeof SHIPPING_COUNTRIES)[number];

// Tariffa per ordine (non per produttore), IVA inclusa, in centesimi.
export const SHIPPING_FLAT_CENTS = 690;

// Dal subtotale (IVA inclusa) in su la spedizione è gratuita.
export const FREE_SHIPPING_THRESHOLD_CENTS = 5900;

// Aliquote IVA ammesse per prodotto. I prezzi sono IVA inclusa.
export const VAT_RATES = [4, 10, 22] as const;
export type VatRate = (typeof VAT_RATES)[number];

export const PRODUCT_CATEGORIES = [
  "dolci",
  "conserve",
  "olio",
  "vino",
  "pasta",
  "formaggi",
  "spezie",
  "box",
  "altro",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

// Disponibilità comunicata dal fornitore.
export const STOCK_STATUSES = ["available", "on_request", "unavailable"] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const SUPPLIER_KINDS = ["manual", "api"] as const;
export type SupplierKind = (typeof SUPPLIER_KINDS)[number];

export const PRODUCT_LINK_KINDS = ["place", "activity"] as const;
export type ProductLinkKind = (typeof PRODUCT_LINK_KINDS)[number];

// Punti (passo 7.2): 100 punti = 1 euro, al massimo il 15% del subtotale.
export const POINTS_PER_EURO = 100;
export const MAX_POINTS_DISCOUNT_PERCENT = 15;

// Recesso del consumatore: 14 giorni per i prodotti non deperibili.
export const RETURN_WINDOW_DAYS = 14;

// Tariffa di spedizione per il subtotale (in centesimi, IVA inclusa). Gratuita dalla soglia in su.
export function shippingCentsFor(subtotalCents: number): number {
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) {
    throw new RangeError("shippingCentsFor: il subtotale deve essere un intero non negativo");
  }
  return subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_FLAT_CENTS;
}

export function isShippingCountry(code: string): code is ShippingCountry {
  return (SHIPPING_COUNTRIES as readonly string[]).includes(code);
}

export function isVatRate(value: number): value is VatRate {
  return (VAT_RATES as readonly number[]).includes(value);
}
