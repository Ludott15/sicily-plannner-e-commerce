import "server-only";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { inArray, sql } from "drizzle-orm";
import type { CoverMedia } from "@/lib/media";
import {
  CART_COOKIE,
  CART_COOKIE_MAX_AGE_SECONDS,
  cartCount,
  type CartItem,
} from "@/lib/shop/cart";
import { cartTotals } from "@/lib/shop/checkout-math";
import { FREE_SHIPPING_THRESHOLD_CENTS } from "@/lib/shop/config";
import { coverJson } from "@/server/catalog/covers";
import { dbPublic } from "@/server/db/public";
import { products } from "@/server/db/schema";
import { openCartValue, sealCartValue } from "./cart-seal";
import { cartSecret } from "./checkout-env";

// Vista del carrello (passo 7.2). Il cookie porta solo id e quantità: prezzi, titoli e disponibilità
// arrivano dal database a ogni lettura (dbPublic, RLS dei prodotti vendibili). Una riga il cui
// prodotto non è più vendibile, o è indisponibile, non entra nella vista e non entra nel checkout.

export type CartLine = {
  productId: string;
  slug: string;
  title: string;
  formatLabel: string | null;
  unitPriceCents: number;
  vatRate: number;
  quantity: number;
  lineTotalCents: number;
  isPerishable: boolean;
  leadTimeDays: number;
  cover: CoverMedia | null;
};

export type CartView = {
  lines: CartLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  freeShippingRemainingCents: number;
  hasPerishable: boolean;
  maxLeadTimeDays: number;
};

export type LoadedCart = {
  view: CartView;
  // Righe del cookie ancora valide (nell'ordine del cookie): la base del checkout.
  items: CartItem[];
  // Righe del cookie scartate perché il prodotto non è più vendibile o è indisponibile.
  droppedLines: number;
};

const firstMedia = sql`(select pm.media_id from public.product_media pm where pm.product_id = ${products.id} order by pm.position limit 1)`;

export function emptyCartView(): CartView {
  return {
    lines: [],
    subtotalCents: 0,
    shippingCents: 0,
    totalCents: 0,
    freeShippingRemainingCents: FREE_SHIPPING_THRESHOLD_CENTS,
    hasPerishable: false,
    maxLeadTimeDays: 0,
  };
}

// Legge i prezzi correnti dal database per le righe date. Un solo viaggio al database (no N+1).
export async function loadCart(items: readonly CartItem[], locale: string): Promise<LoadedCart> {
  if (items.length === 0) return { view: emptyCartView(), items: [], droppedLines: 0 };

  const rows = await dbPublic((tx) =>
    tx
      .select({
        id: products.id,
        slug: products.slug,
        titleIt: products.title,
        titleEn: products.titleEn,
        formatLabel: products.formatLabel,
        priceCents: products.priceCents,
        vatRate: products.vatRate,
        stockStatus: products.stockStatus,
        isPerishable: products.isPerishable,
        leadTimeDays: products.leadTimeDays,
        cover: coverJson(firstMedia),
      })
      .from(products)
      .where(inArray(products.id, items.map((item) => item.productId))),
  );
  const byId = new Map(rows.map((row) => [row.id, row]));

  const kept: CartItem[] = [];
  const lines: CartLine[] = [];
  for (const item of items) {
    const row = byId.get(item.productId);
    if (!row || row.stockStatus === "unavailable") continue;
    kept.push(item);
    lines.push({
      productId: row.id,
      slug: row.slug,
      title: locale === "en" && row.titleEn ? row.titleEn : row.titleIt,
      formatLabel: row.formatLabel,
      unitPriceCents: row.priceCents,
      vatRate: row.vatRate,
      quantity: item.quantity,
      lineTotalCents: row.priceCents * item.quantity,
      isPerishable: row.isPerishable,
      leadTimeDays: row.leadTimeDays,
      cover: row.cover,
    });
  }

  return {
    view: { lines, ...cartTotals(lines) },
    items: kept,
    droppedLines: items.length - kept.length,
  };
}

// Stato del cookie per le azioni e le pagine. Null: segreto assente in produzione, carrello spento.
export async function readCartState(): Promise<{ secret: string; items: CartItem[] } | null> {
  const secret = cartSecret();
  if (!secret) return null;
  const jar = await cookies();
  return { secret, items: openCartValue(jar.get(CART_COOKIE)?.value, secret) };
}

// Numero di articoli per il badge dell'header: dal cookie, senza database.
export async function readCartCount(): Promise<number> {
  const state = await readCartState();
  return state ? cartCount(state.items) : 0;
}

// Vista del carrello con i prezzi correnti, nella lingua della pagina.
export async function readCart(): Promise<CartView> {
  const state = await readCartState();
  if (!state) return emptyCartView();
  const locale = await getLocale();
  return (await loadCart(state.items, locale)).view;
}

export async function writeCartItems(items: readonly CartItem[], secret: string): Promise<void> {
  const jar = await cookies();
  jar.set(CART_COOKIE, sealCartValue(items, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE_SECONDS,
  });
}
