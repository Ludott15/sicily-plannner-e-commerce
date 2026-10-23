import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { CART_VERSION, cartItemsFromUnknown, type CartItem } from "@/lib/shop/cart";

// Firma del cookie del carrello (HMAC-SHA256 con CART_SECRET). Formato del valore:
// base64url(JSON {v:1, items:[{p,q}]}) + "." + base64url(HMAC del corpo). Nessun prezzo nel cookie.
// Firma non valida, JSON rotto o versione diversa: carrello vuoto. Funzioni pure, senza cookie.

function sign(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

function encodeBody(items: readonly CartItem[]): string {
  const wire = { v: CART_VERSION, items: items.map((item) => ({ p: item.productId, q: item.quantity })) };
  return Buffer.from(JSON.stringify(wire), "utf8").toString("base64url");
}

function decodeBody(body: string): CartItem[] {
  try {
    return cartItemsFromUnknown(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    return [];
  }
}

export function sealCartValue(items: readonly CartItem[], secret: string): string {
  const body = encodeBody(items);
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

export function openCartValue(value: string | undefined, secret: string): CartItem[] {
  if (!value) return [];
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return [];
  const body = value.slice(0, dot);
  const expected = sign(body, secret);
  const received = Buffer.from(value.slice(dot + 1), "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return [];
  return decodeBody(body);
}
