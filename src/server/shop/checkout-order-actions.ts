"use server";

import "server-only";
import { z } from "zod";
import type { OrderStatus } from "@/lib/shop/orders";
import { orderForCheckoutSession } from "./orders";

// Azione di polling della pagina di esito (passo 7.3). Chiede al server se il webhook ha già creato
// l'ordine della sessione: solo numero e stato, mai dati del cliente. Un identificativo non valido o un
// ordine non ancora creato danno "pending": il client riprova per un tempo limitato, poi mostra il testo neutro.

export type CheckoutOrderStatusResult =
  | { status: "found"; orderNumber: string; orderStatus: OrderStatus }
  | { status: "pending" };

const sessionSchema = z.string().max(200);

export async function checkoutOrderStatusAction(sessionId: unknown): Promise<CheckoutOrderStatusResult> {
  const parsed = sessionSchema.safeParse(sessionId);
  if (!parsed.success) return { status: "pending" };
  const order = await orderForCheckoutSession(parsed.data);
  if (!order) return { status: "pending" };
  return { status: "found", orderNumber: order.orderNumber, orderStatus: order.status };
}
