import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { ordersAdminEmail } from "@/lib/env";
import { AUTO_DELIVERY_DAYS, SUPPLIER_DELAY_GRACE_DAYS } from "@/lib/shop/config";
import { dbAdmin } from "@/server/db/admin";
import { orders } from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { deliverOrderTx } from "./orders-state.admin";

// Cron /api/cron/shop (passo 7.3), ogni ora. Due regole, ciascuna idempotente:
// (a) ordini inoltrati senza tracking oltre il tempo di evasione massimo delle righe più
//     SUPPLIER_DELAY_GRACE_DAYS giorni di calendario: si segna supplier_delay_notified_at, una sola volta.
//     L'admin lo vede in elenco ("fornitore in ritardo") e, se ORDERS_ADMIN_EMAIL è configurato, riceve
//     un avviso per email;
// (b) ordini spediti da oltre AUTO_DELIVERY_DAYS giorni: diventano consegnati e l'account riceve i punti, una
//     sola volta (award_points ha il vincolo unico utente/motivo/ordine e lo stato cambia solo da shipped).
// Il cron non è un'azione admin: non scrive nel registro admin_audit_log.

export type OrdersCronReport = {
  delayNotices: number;
  delivered: number;
  pointsAwarded: number;
  delayEmail: "sent" | "not_configured" | "not_sent";
};

const DELIVERY_BATCH = 200;

export async function runOrdersCron(now: Date = new Date()): Promise<OrdersCronReport> {
  const delayed = await markSupplierDelays(now);
  const delayEmail = await notifyDelays(delayed);
  const deliveries = await deliverDueOrders(now);
  return {
    delayNotices: delayed.length,
    delivered: deliveries.delivered,
    pointsAwarded: deliveries.pointsAwarded,
    delayEmail,
  };
}

// (a) Avviso una sola volta per ordine. Il tempo di evasione è quello massimo delle righe, in giorni di
// calendario, più SUPPLIER_DELAY_GRACE_DAYS; senza righe si usano 3 giorni (il default del prodotto).
async function markSupplierDelays(now: Date): Promise<{ orderNumber: string }[]> {
  const rows = await dbAdmin.execute<{ order_number: string }>(sql`
    with due as (
      select o.id
        from public.orders o
       where o.supplier_status = 'forwarded'
         and o.tracking_number is null
         and o.supplier_delay_notified_at is null
         and o.forwarded_at is not null
         and o.forwarded_at + make_interval(
               days => (
                 select coalesce(max(p.lead_time_days), 3)
                   from public.order_items oi
                   join public.products p on p.id = oi.product_id
                  where oi.order_id = o.id
               ) + ${SUPPLIER_DELAY_GRACE_DAYS}::integer
             ) < ${now.toISOString()}::timestamptz
    )
    update public.orders o
       set supplier_delay_notified_at = ${now.toISOString()}::timestamptz
      from due
     where o.id = due.id
    returning o.order_number
  `);
  if (rows.length > 0) console.warn("orders_supplier_delayed", { count: rows.length });
  return rows.map((row) => ({ orderNumber: row.order_number }));
}

// Avviso per email all'indirizzo ORDERS_ADMIN_EMAIL, se configurato. Il messaggio contiene solo i numeri
// d'ordine. L'esito si registra come nelle altre email, senza destinatario né contenuto.
async function notifyDelays(delayed: readonly { orderNumber: string }[]): Promise<OrdersCronReport["delayEmail"]> {
  if (delayed.length === 0) return "not_configured";
  const to = ordersAdminEmail();
  if (!to) return "not_configured";
  const numbers = delayed.map((row) => row.orderNumber);
  const list = numbers.join(", ");
  const result = await sendEmail({
    to,
    subject: `Fornitore in ritardo: ${numbers.length} ordini senza tracking`,
    text: `Ordini inoltrati da più di tempo senza tracking: ${list}. Controllare nel pannello admin, sezione Ordini (in ritardo).`,
    html: `<p>Ordini inoltrati da più di tempo senza tracking: ${list}.</p><p>Controllare nel pannello admin, sezione Ordini (in ritardo).</p>`,
  });
  if (result.status !== "sent") {
    console.error("orders_delay_email_not_sent", { status: result.status });
    return "not_sent";
  }
  return "sent";
}

// (b) Consegna automatica. Ogni ordine si chiude nella sua transazione: se una fallisce, le altre restano.
async function deliverDueOrders(now: Date): Promise<{ delivered: number; pointsAwarded: number }> {
  const cutoff = new Date(now.getTime() - AUTO_DELIVERY_DAYS * 24 * 60 * 60 * 1000);
  const due = await dbAdmin
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "shipped"), lt(orders.shippedAt, cutoff)))
    .limit(DELIVERY_BATCH);

  let delivered = 0;
  let pointsAwarded = 0;
  for (const row of due) {
    try {
      const result = await dbAdmin.transaction((tx) => deliverOrderTx(tx, { orderId: row.id, actorId: null, now }));
      if (result.ok) {
        delivered += 1;
        pointsAwarded += result.pointsAwarded;
      }
    } catch (error) {
      console.error("orders_cron_delivery_failed", {
        name: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  return { delivered, pointsAwarded };
}
