import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  isOrderNumber,
  ORDER_STATUSES,
  parseShippingAddress,
  type OrderItemView,
  type OrderStatus,
  type OrderView,
} from "@/lib/shop/orders";
import { dbPublic } from "@/server/db/public";
import { orderItems, orders } from "@/server/db/schema";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { accessTokenSchema } from "./order-token";

// Letture degli ordini per il cliente (passo 7.3). Nessuna scrittura. Tre percorsi:
// - account: elenco e dettaglio con dbAsUser, quindi con la RLS (proprietario) e i grant per colonna. Il
//   cliente non vede costo d'acquisto, fornitore, codice del fornitore, token né id di Stripe;
// - ospite: numero + token del link. Il server passa il token a public.order_guest_detail, che calcola lo
//   SHA-256 nel database e confronta con access_token_hash. Nessun hash esce dal database; senza il token
//   giusto non torna nessun dato;
// - pagina di esito: numero e stato dell'ordine dalla sessione Stripe (public.order_for_checkout_session).
// Ogni input passa da una validazione prima di toccare il database; un input non valido dà null.

export type MyOrderSummary = {
  orderNumber: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
};

const SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]+$/;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

// Riga dell'account (Drizzle, colonne esplicite: nessuna colonna riservata).
export async function listMyOrders(user: DbUser): Promise<MyOrderSummary[]> {
  const rows = await dbAsUser(user, (tx) =>
    tx
      .select({
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalCents: orders.totalCents,
        createdAt: orders.createdAt,
        shippedAt: orders.shippedAt,
        deliveredAt: orders.deliveredAt,
      })
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt))
      .limit(100),
  );
  return rows.map((row) => ({
    orderNumber: row.orderNumber,
    status: row.status,
    totalCents: row.totalCents,
    createdAt: row.createdAt.toISOString(),
    shippedAt: iso(row.shippedAt),
    deliveredAt: iso(row.deliveredAt),
  }));
}

// Dettaglio di un ordine dell'account. La RLS restituisce solo gli ordini del proprietario: un numero di
// un altro utente dà null, come un numero inesistente.
export async function getMyOrder(user: DbUser, orderNumber: string): Promise<OrderView | null> {
  if (!isOrderNumber(orderNumber)) return null;
  return dbAsUser(user, async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        subtotalCents: orders.subtotalCents,
        discountCents: orders.discountCents,
        shippingCents: orders.shippingCents,
        totalCents: orders.totalCents,
        pointsRedeemed: orders.pointsRedeemed,
        shippingAddress: orders.shippingAddress,
        carrier: orders.carrier,
        trackingNumber: orders.trackingNumber,
        trackingUrl: orders.trackingUrl,
        shippedAt: orders.shippedAt,
        deliveredAt: orders.deliveredAt,
      })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    if (!order) return null;

    const items = await tx
      .select({
        title: orderItems.titleSnapshot,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        vatRate: orderItems.vatRate,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(orderItems.createdAt, orderItems.id);

    return toOrderView({
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      pointsRedeemed: order.pointsRedeemed,
      shippingAddress: order.shippingAddress,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      shippedAt: iso(order.shippedAt),
      deliveredAt: iso(order.deliveredAt),
      items,
    });
  });
}

type OrderFields = {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  pointsRedeemed: number;
  shippingAddress: unknown;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  items: { title: string; quantity: number; unitPriceCents: number; vatRate: number }[];
};

function toOrderView(fields: OrderFields): OrderView {
  const items: OrderItemView[] = fields.items.map((item) => ({
    title: item.title,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    vatRate: item.vatRate,
    lineTotalCents: item.unitPriceCents * item.quantity,
  }));
  return {
    orderNumber: fields.orderNumber,
    status: fields.status,
    createdAt: fields.createdAt,
    subtotalCents: fields.subtotalCents,
    discountCents: fields.discountCents,
    shippingCents: fields.shippingCents,
    totalCents: fields.totalCents,
    pointsRedeemed: fields.pointsRedeemed,
    shippingAddress: parseShippingAddress(fields.shippingAddress),
    carrier: fields.carrier,
    trackingNumber: fields.trackingNumber,
    trackingUrl: fields.trackingUrl,
    shippedAt: fields.shippedAt,
    deliveredAt: fields.deliveredAt,
    items,
  };
}

// Forma del JSON che restituisce public.order_guest_detail (chiavi snake_case, scritte in SQL).
const guestDetailSchema = z.object({
  order_number: z.string(),
  status: z.enum(ORDER_STATUSES),
  created_at: z.string(),
  subtotal_cents: z.number().int(),
  discount_cents: z.number().int(),
  shipping_cents: z.number().int(),
  total_cents: z.number().int(),
  points_redeemed: z.number().int(),
  shipping_address: z.unknown(),
  carrier: z.string().nullable(),
  tracking_number: z.string().nullable(),
  tracking_url: z.string().nullable(),
  shipped_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  items: z.array(
    z.object({
      title: z.string(),
      quantity: z.number().int(),
      unit_price_cents: z.number().int(),
      vat_rate: z.number().int(),
    }),
  ),
});

// Ordine dell'ospite con il numero e il token del link. Null se il numero o il token non sono validi.
export async function getGuestOrder(orderNumber: string, token: string): Promise<OrderView | null> {
  if (!isOrderNumber(orderNumber)) return null;
  const parsedToken = accessTokenSchema.safeParse(token);
  if (!parsedToken.success) return null;

  // Il token va alla funzione SQL, che calcola lo SHA-256 e confronta con access_token_hash. Nessun hash passa
  // dal server: l'unica risposta è la riga dell'ordine, o nulla.
  const detailRows = await dbPublic((tx) =>
    tx.execute<{ detail: unknown }>(
      sql`select public.order_guest_detail(${orderNumber}::text, ${parsedToken.data}::text) as detail`,
    ),
  );
  const detail = detailRows[0]?.detail;
  if (detail === null || detail === undefined) return null;
  const parsed = guestDetailSchema.safeParse(detail);
  if (!parsed.success) return null;
  const value = parsed.data;

  return toOrderView({
    orderNumber: value.order_number,
    status: value.status,
    createdAt: value.created_at,
    subtotalCents: value.subtotal_cents,
    discountCents: value.discount_cents,
    shippingCents: value.shipping_cents,
    totalCents: value.total_cents,
    pointsRedeemed: value.points_redeemed,
    shippingAddress: value.shipping_address,
    carrier: value.carrier,
    trackingNumber: value.tracking_number,
    trackingUrl: value.tracking_url,
    shippedAt: value.shipped_at,
    deliveredAt: value.delivered_at,
    items: value.items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      vatRate: item.vat_rate,
    })),
  });
}

// Pagina di esito: numero e stato dell'ordine della sessione, se il webhook è già arrivato. Null altrimenti
// (il client riprova per un po', poi mostra il testo neutro).
export async function orderForCheckoutSession(
  sessionId: string,
): Promise<{ orderNumber: string; status: OrderStatus } | null> {
  if (!SESSION_ID_PATTERN.test(sessionId)) return null;
  const rows = await dbPublic((tx) =>
    tx.execute<{ found: { order_number: string; status: string } | null }>(
      sql`select public.order_for_checkout_session(${sessionId}::text) as found`,
    ),
  );
  const found = rows[0]?.found;
  if (!found) return null;
  const status = z.enum(ORDER_STATUSES).safeParse(found.status);
  if (!status.success || !isOrderNumber(found.order_number)) return null;
  return { orderNumber: found.order_number, status: status.data };
}
