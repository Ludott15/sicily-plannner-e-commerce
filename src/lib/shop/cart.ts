import { z } from "zod";

// Carrello (passo 7.2). Il cookie firmato contiene solo id di prodotto e quantità: mai prezzi.
// I prezzi li legge il server dal database a ogni richiesta (src/server/shop/cart.ts).
// Questo modulo è puro: niente cookie, niente database, niente firma.

export const CART_COOKIE = "isula_cart";
export const CART_VERSION = 1;
export const CART_MAX_LINES = 20;
export const CART_MAX_QUANTITY = 10;
export const CART_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type CartItem = { productId: string; quantity: number };

export type CartChange = { ok: true; items: CartItem[] } | { ok: false; code: "limit" };

// Forma della riga nel cookie: p = id del prodotto, q = quantità. Campi in più si ignorano.
const wireItemSchema = z.object({
  p: z.uuid(),
  q: z.number().int().min(1).max(CART_MAX_QUANTITY),
});

const wirePayloadSchema = z.object({
  v: z.literal(CART_VERSION),
  items: z.array(z.unknown()),
});

// Righe valide del carrello, nell'ordine del cookie. Righe non valide si scartano; un prodotto
// ripetuto si somma (con il tetto di CART_MAX_QUANTITY); oltre CART_MAX_LINES righe si scarta il resto.
export function cartItemsFromUnknown(value: unknown): CartItem[] {
  const payload = wirePayloadSchema.safeParse(value);
  if (!payload.success) return [];

  const items: CartItem[] = [];
  for (const raw of payload.data.items) {
    const parsed = wireItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const { p, q } = parsed.data;
    const existing = items.find((item) => item.productId === p);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + q, CART_MAX_QUANTITY);
      continue;
    }
    if (items.length >= CART_MAX_LINES) break;
    items.push({ productId: p, quantity: q });
  }
  return items;
}

// Aggiunge quantità a un prodotto (o crea la riga). Oltre il tetto di quantità o di righe: limit.
export function addLine(items: CartItem[], productId: string, quantity: number): CartChange {
  const existing = items.find((item) => item.productId === productId);
  if (existing) {
    const total = existing.quantity + quantity;
    if (total > CART_MAX_QUANTITY) return { ok: false, code: "limit" };
    return { ok: true, items: items.map((item) => (item.productId === productId ? { productId, quantity: total } : item)) };
  }
  if (items.length >= CART_MAX_LINES || quantity > CART_MAX_QUANTITY) return { ok: false, code: "limit" };
  return { ok: true, items: [...items, { productId, quantity }] };
}

// Imposta la quantità di una riga. Zero rimuove la riga.
export function setLineQuantity(items: CartItem[], productId: string, quantity: number): CartChange {
  if (quantity === 0) return { ok: true, items: items.filter((item) => item.productId !== productId) };
  if (quantity > CART_MAX_QUANTITY) return { ok: false, code: "limit" };
  if (items.some((item) => item.productId === productId)) {
    return { ok: true, items: items.map((item) => (item.productId === productId ? { productId, quantity } : item)) };
  }
  if (items.length >= CART_MAX_LINES) return { ok: false, code: "limit" };
  return { ok: true, items: [...items, { productId, quantity }] };
}

// Numero di articoli (somma delle quantità): è il numero nel badge dell'header.
export function cartCount(items: readonly CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
