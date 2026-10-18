"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { addLine, CART_MAX_QUANTITY, cartCount, setLineQuantity, type CartItem } from "@/lib/shop/cart";
import { dbPublic } from "@/server/db/public";
import { products } from "@/server/db/schema";
import { readCartState, writeCartItems } from "./cart";

// Azioni del carrello (passo 7.2). Il cookie cambia solo qui; i prezzi non entrano mai nelle richieste.
// Codici: not_available (prodotto non vendibile o indisponibile), limit (oltre quantità o righe),
// invalid (input non valido), unavailable (carrello spento: in produzione senza CART_SECRET).

export type CartErrorCode = "not_available" | "limit" | "invalid" | "unavailable";
export type CartActionResult = { status: "ok"; count: number } | { status: "error"; code: CartErrorCode };

const addSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(CART_MAX_QUANTITY),
});

const updateSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(0).max(CART_MAX_QUANTITY),
});

// Vale come vendibile solo ciò che la RLS dei prodotti fa vedere (product_is_sellable) e non è indisponibile.
async function isOrderable(productId: string): Promise<boolean> {
  const rows = await dbPublic((tx) =>
    tx
      .select({ stockStatus: products.stockStatus })
      .from(products)
      .where(eq(products.id, productId)),
  );
  const row = rows[0];
  return row !== undefined && row.stockStatus !== "unavailable";
}

async function save(items: readonly CartItem[], secret: string): Promise<CartActionResult> {
  await writeCartItems(items, secret);
  // Il badge del carrello sta nel layout: va ricalcolato su tutte le pagine.
  revalidatePath("/", "layout");
  return { status: "ok", count: cartCount(items) };
}

export async function addToCart(input: { productId: string; quantity: number }): Promise<CartActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const state = await readCartState();
  if (!state) return { status: "error", code: "unavailable" };
  if (!(await isOrderable(parsed.data.productId))) return { status: "error", code: "not_available" };
  const change = addLine(state.items, parsed.data.productId, parsed.data.quantity);
  if (!change.ok) return { status: "error", code: "limit" };
  return save(change.items, state.secret);
}

// Quantità 0 rimuove la riga. Una quantità positiva su una riga nuova richiede un prodotto vendibile.
export async function updateCartLine(input: { productId: string; quantity: number }): Promise<CartActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const state = await readCartState();
  if (!state) return { status: "error", code: "unavailable" };
  const { productId, quantity } = parsed.data;
  if (quantity > 0 && !(await isOrderable(productId))) return { status: "error", code: "not_available" };
  const change = setLineQuantity(state.items, productId, quantity);
  if (!change.ok) return { status: "error", code: "limit" };
  return save(change.items, state.secret);
}

export async function clearCart(): Promise<CartActionResult> {
  const state = await readCartState();
  if (!state) return { status: "error", code: "unavailable" };
  return save([], state.secret);
}
