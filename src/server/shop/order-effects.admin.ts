import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { formatCents } from "@/lib/shop/present";
import { orderPageUrl, parseShippingAddress } from "@/lib/shop/orders";
import { publicEnv } from "@/lib/env";
import { dbAdmin } from "@/server/db/admin";
import { orderItems, orders, products, suppliers } from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { renderOrderConfirmationEmail } from "@/server/email/templates/order-confirmation";
import { renderShippingEmail } from "@/server/email/templates/shipping";
import { adapterFor, type SupplierForwardInput } from "./suppliers/adapter";
import type { OrderEffect } from "./orders-state.admin";

// Effetti dopo il commit (passo 7.3). Le email e l'inoltro al fornitore non stanno nella transazione: se
// falliscono, l'ordine resta com'è e si registra solo il codice dell'errore. Un ordine ancora in attesa
// (supplier_status pending) compare nell'admin come "da inoltrare a mano".

// Invio con esito registrato: se la posta non risponde "sent" (non configurata o fallita) si logga il tipo
// di email e lo stato, mai il destinatario né il contenuto.
async function deliver(kind: string, to: string, message: { subject: string; html: string; text: string }): Promise<void> {
  const result = await sendEmail({ to, subject: message.subject, html: message.html, text: message.text });
  if (result.status !== "sent") {
    console.error("order_email_not_sent", { kind, status: result.status });
  }
}

// Pagamento ricevuto: email di conferma al cliente, poi inoltro ai fornitori (un'email per fornitore).
// Con forward false (rimando del link) si manda solo la conferma.
async function sendPaidEffects(orderId: string, accessToken: string | null, forward = true): Promise<void> {
  const [order] = await dbAdmin.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return;
  const locale = order.locale === "en" ? "en" : "it";
  const address = parseShippingAddress(order.shippingAddress);

  const items = await dbAdmin
    .select({
      productId: orderItems.productId,
      supplierId: orderItems.supplierId,
      supplierSku: orderItems.supplierSku,
      titleSnapshot: orderItems.titleSnapshot,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
      leadTimeDays: products.leadTimeDays,
    })
    .from(orderItems)
    .innerJoin(products, eq(products.id, orderItems.productId))
    .where(eq(orderItems.orderId, order.id));

  const url = orderPageUrl({
    siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
    locale,
    orderNumber: order.orderNumber,
    accessToken,
  });

  const confirmation = await renderOrderConfirmationEmail({
    locale,
    orderNumber: order.orderNumber,
    customerName: address?.name ?? null,
    lines: items.map((item) => ({
      name: item.titleSnapshot,
      quantity: item.quantity,
      totalLabel: formatCents(item.unitPriceCents * item.quantity, locale),
    })),
    totalLabel: formatCents(order.totalCents, locale),
    url,
  });
  await deliver("conferma", order.email, confirmation);

  // Rimando del link: solo la conferma, mai l'inoltro. Revisione in corso: nessun inoltro. Inoltro già fatto
  // (o annullato): nessun doppione.
  if (!forward || order.needsReview || order.supplierStatus !== "pending" || order.status !== "paid") return;

  const supplierIds = [...new Set(items.map((item) => item.supplierId))];
  const supplierRows = await dbAdmin.select().from(suppliers).where(inArray(suppliers.id, supplierIds));
  const supplierById = new Map(supplierRows.map((row) => [row.id, row]));

  let allForwarded = supplierIds.length > 0;
  for (const supplierId of supplierIds) {
    const supplier = supplierById.get(supplierId);
    const adapter = supplier ? adapterFor(supplier) : null;
    if (!supplier || !adapter) {
      allForwarded = false;
      continue;
    }
    const supplierItems = items.filter((item) => item.supplierId === supplierId);
    const input: SupplierForwardInput = {
      orderNumber: order.orderNumber,
      leadTimeDays: Math.max(...supplierItems.map((item) => item.leadTimeDays)),
      address,
      phone: address?.phone ?? null,
      lines: supplierItems.map((item) => ({
        title: item.titleSnapshot,
        quantity: item.quantity,
        sku: item.supplierSku,
      })),
    };
    const result = await adapter.forward(input);
    if (result.status !== "forwarded") allForwarded = false;
  }

  if (allForwarded) {
    await dbAdmin
      .update(orders)
      .set({ supplierStatus: "forwarded", forwardedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.supplierStatus, "pending")));
  }
}

// Spedizione: email al cliente con corriere, tracking e link alla pagina dell'ordine.
async function sendShippedEffect(orderId: string, accessToken: string | null): Promise<void> {
  const [order] = await dbAdmin.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || !order.carrier) return;
  const locale = order.locale === "en" ? "en" : "it";
  const email = await renderShippingEmail({
    locale,
    orderNumber: order.orderNumber,
    carrier: order.carrier,
    trackingCode: order.trackingNumber,
    estimatedDate: null,
    url: orderPageUrl({ siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL, locale, orderNumber: order.orderNumber, accessToken }),
  });
  await deliver("spedizione", order.email, email);
}

// Esegue gli effetti di un evento già committato. Non lancia: un errore si registra con il solo codice.
export async function runOrderEffects(effects: readonly OrderEffect[]): Promise<void> {
  for (const effect of effects) {
    try {
      if (effect.kind === "paid") {
        await sendPaidEffects(effect.orderId, effect.accessToken);
      } else if (effect.kind === "shipped") {
        await sendShippedEffect(effect.orderId, effect.accessToken);
      } else {
        // Rimando del link: l'email giusta per lo stato dell'ordine, senza inoltro al fornitore.
        const [order] = await dbAdmin.select({ status: orders.status }).from(orders).where(eq(orders.id, effect.orderId)).limit(1);
        if (order?.status === "shipped") await sendShippedEffect(effect.orderId, effect.accessToken);
        else await sendPaidEffects(effect.orderId, effect.accessToken, false);
      }
    } catch (error) {
      console.error("order_effect_failed", {
        kind: effect.kind,
        name: error instanceof Error ? error.name : "unknown",
      });
    }
  }
}
