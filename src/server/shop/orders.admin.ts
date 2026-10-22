import "server-only";
import { and, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  ORDER_STATUSES,
  parseShippingAddress,
  SUPPLIER_STATUSES,
  orderVatBreakdown,
  type OrderShippingAddressView,
  type OrderStatus,
  type SupplierStatus,
} from "@/lib/shop/orders";
import { ordersCsv, type OrdersCsvRow } from "@/lib/shop/orders-csv";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { orderItems, orders, producers, suppliers } from "@/server/db/schema";

// Letture e export per l'area admin (passo 7.3). Ogni funzione richiede un admin (requireAdmin) e legge
// con dbAdmin. Nessuna scrittura qui: le azioni sono in orders-actions.admin.ts.

export type AdminOrderRow = {
  id: string;
  orderNumber: string;
  createdAt: string;
  email: string;
  status: OrderStatus;
  supplierStatus: SupplierStatus;
  needsReview: boolean;
  totalCents: number;
  trackingNumber: string | null;
  forwardedAt: string | null;
  supplierDelayNotified: boolean;
  // Da inoltrare a mano: pagato, senza revisione, ancora in attesa del fornitore.
  toForwardByHand: boolean;
};

export type AdminOrderFilter = {
  status?: OrderStatus;
  supplierStatus?: SupplierStatus;
  // Solo ordini che richiedono attenzione: revisione, da inoltrare a mano, fornitore in ritardo.
  attention?: "review" | "to_forward" | "delayed";
  limit?: number;
};

const filterSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  supplierStatus: z.enum(SUPPLIER_STATUSES).optional(),
  attention: z.enum(["review", "to_forward", "delayed"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export async function listOrdersAdmin(filter: AdminOrderFilter = {}): Promise<AdminOrderRow[]> {
  await requireAdmin();
  const parsed = filterSchema.safeParse(filter);
  const input = parsed.success ? parsed.data : {};

  const conditions: SQL[] = [];
  if (input.status) conditions.push(eq(orders.status, input.status));
  if (input.supplierStatus) conditions.push(eq(orders.supplierStatus, input.supplierStatus));
  if (input.attention === "review") conditions.push(eq(orders.needsReview, true));
  if (input.attention === "to_forward") {
    conditions.push(eq(orders.status, "paid"), eq(orders.supplierStatus, "pending"), eq(orders.needsReview, false));
  }
  if (input.attention === "delayed") conditions.push(sql`${orders.supplierDelayNotifiedAt} is not null`);

  const rows = await dbAdmin
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      email: orders.email,
      status: orders.status,
      supplierStatus: orders.supplierStatus,
      needsReview: orders.needsReview,
      totalCents: orders.totalCents,
      trackingNumber: orders.trackingNumber,
      forwardedAt: orders.forwardedAt,
      supplierDelayNotifiedAt: orders.supplierDelayNotifiedAt,
    })
    .from(orders)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(input.limit ?? 100);

  return rows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber,
    createdAt: row.createdAt.toISOString(),
    email: row.email,
    status: row.status,
    supplierStatus: row.supplierStatus,
    needsReview: row.needsReview,
    totalCents: row.totalCents,
    trackingNumber: row.trackingNumber,
    forwardedAt: iso(row.forwardedAt),
    supplierDelayNotified: row.supplierDelayNotifiedAt !== null,
    toForwardByHand: row.status === "paid" && row.supplierStatus === "pending" && !row.needsReview,
  }));
}

export type AdminOrderItem = {
  productId: string;
  title: string;
  producerName: string | null;
  supplierName: string;
  supplierSku: string | null;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  lineTotalCents: number;
  costCents: number | null;
};

export type AdminOrderDetail = {
  id: string;
  orderNumber: string;
  createdAt: string;
  email: string;
  locale: string;
  status: OrderStatus;
  supplierStatus: SupplierStatus;
  needsReview: boolean;
  paidAmountCents: number | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  pointsRedeemed: number;
  shippingAddress: OrderShippingAddressView | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  forwardedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  supplierDelayNotified: boolean;
  problemNote: string | null;
  stripeSessionId: string;
  paymentIntentId: string | null;
  items: AdminOrderItem[];
  // Margine sui prodotti: (subtotale − sconto punti) − costi d'acquisto. Null se manca un costo.
  marginCents: number | null;
};

export async function getOrderAdmin(orderId: string): Promise<AdminOrderDetail | null> {
  await requireAdmin();
  if (!z.uuid().safeParse(orderId).success) return null;

  const [order] = await dbAdmin.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;

  const items = await dbAdmin
    .select({
      productId: orderItems.productId,
      title: orderItems.titleSnapshot,
      producerName: producers.name,
      supplierName: suppliers.name,
      supplierSku: orderItems.supplierSku,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
      vatRate: orderItems.vatRate,
      costCents: orderItems.costCentsSnapshot,
    })
    .from(orderItems)
    .innerJoin(producers, eq(producers.id, orderItems.producerId))
    .innerJoin(suppliers, eq(suppliers.id, orderItems.supplierId))
    .where(eq(orderItems.orderId, order.id))
    .orderBy(orderItems.createdAt, orderItems.id);

  const itemViews: AdminOrderItem[] = items.map((item) => ({
    productId: item.productId,
    title: item.title,
    producerName: item.producerName,
    supplierName: item.supplierName,
    supplierSku: item.supplierSku,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    vatRate: item.vatRate,
    lineTotalCents: item.unitPriceCents * item.quantity,
    costCents: item.costCents,
  }));
  const costs = itemViews.map((item) => (item.costCents === null ? null : item.costCents * item.quantity));
  const marginCents = costs.some((cost) => cost === null)
    ? null
    : order.subtotalCents - order.discountCents - costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    email: order.email,
    locale: order.locale,
    status: order.status,
    supplierStatus: order.supplierStatus,
    needsReview: order.needsReview,
    paidAmountCents: order.paidAmountCents,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    pointsRedeemed: order.pointsRedeemed,
    shippingAddress: parseShippingAddress(order.shippingAddress),
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    forwardedAt: iso(order.forwardedAt),
    shippedAt: iso(order.shippedAt),
    deliveredAt: iso(order.deliveredAt),
    supplierDelayNotified: order.supplierDelayNotifiedAt !== null,
    problemNote: order.problemNote,
    stripeSessionId: order.stripeSessionId,
    paymentIntentId: order.paymentIntentId,
    items: itemViews,
    marginCents,
  };
}

export const csvPeriodSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
});

// Data del fuso di Roma, YYYY-MM-DD.
function romeDate(value: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(value);
}

// CSV per il commercialista: ordini pagati o successivi al pagamento (non in attesa, non annullati) creati
// nel periodo [from, to] (date del fuso di Roma, estremi inclusi). Una riga per ordine.
export async function exportOrdersCsv(input: { from: string; to: string }): Promise<string> {
  await requireAdmin();
  const period = csvPeriodSchema.parse(input);
  if (period.from > period.to) throw new RangeError("exportOrdersCsv: periodo non valido");

  const rows = await dbAdmin
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      status: orders.status,
      shippingCents: orders.shippingCents,
      discountCents: orders.discountCents,
      totalCents: orders.totalCents,
      needsReview: orders.needsReview,
    })
    .from(orders)
    .where(
      and(
        inArray(orders.status, ["paid", "shipped", "delivered", "refunded"]),
        gte(orders.createdAt, sql`(${period.from}::date)::timestamp at time zone 'Europe/Rome'`),
        lt(orders.createdAt, sql`((${period.to}::date + 1)::timestamp) at time zone 'Europe/Rome'`),
      ),
    )
    .orderBy(orders.createdAt, orders.id);

  const orderIds = rows.map((row) => row.id);
  const items =
    orderIds.length === 0
      ? []
      : await dbAdmin
          .select({
            orderId: orderItems.orderId,
            unitPriceCents: orderItems.unitPriceCents,
            quantity: orderItems.quantity,
            vatRate: orderItems.vatRate,
            costCents: orderItems.costCentsSnapshot,
          })
          .from(orderItems)
          .where(inArray(orderItems.orderId, orderIds));

  const csvRows: OrdersCsvRow[] = rows.map((row) => {
    const own = items.filter((item) => item.orderId === row.id);
    const vat = orderVatBreakdown({
      lines: own.map((item) => ({ totalCents: item.unitPriceCents * item.quantity, vatRate: item.vatRate })),
      discountCents: row.discountCents,
      shippingCents: row.shippingCents,
    });
    const costs = own.map((item) => (item.costCents === null ? null : item.costCents * item.quantity));
    const costCents = costs.some((cost) => cost === null)
      ? null
      : costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0);
    return {
      date: romeDate(row.createdAt),
      orderNumber: row.orderNumber,
      status: row.status,
      vat,
      shippingCents: row.shippingCents,
      discountCents: row.discountCents,
      totalCents: row.totalCents,
      costCents,
      needsReview: row.needsReview,
    };
  });

  return ordersCsv(csvRows);
}
