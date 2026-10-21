import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { AUTO_DELIVERY_DAYS, SUPPLIER_DELAY_GRACE_DAYS } from "@/lib/shop/config";
import { dbAdmin } from "@/server/db/admin";
import { orders } from "@/server/db/schema";
import { deliverOrderTx } from "./orders-state.admin";

// Cron /api/cron/shop (passo 7.3), ogni ora. Due regole, ciascuna idempotente:
// (a) ordini inoltrati senza tracking oltre il tempo di evasione massimo delle righe più
//     SUPPLIER_DELAY_GRACE_DAYS: si segna supplier_delay_notified_at, una sola volta. L'admin lo vede in
//     elenco come "fornitore in ritardo";
// (b) ordini spediti da oltre AUTO_DELIVERY_DAYS: diventano consegnati e l'account riceve i punti, una sola
//     volta (award_points ha il vincolo unico utente/motivo/ordine e lo stato cambia solo da shipped).
// Il cron non è un'azione admin: non scrive nel registro admin_audit_log.

export type OrdersCronReport = {
  delayNotices: number;
  delivered: number;
  pointsAwarded: number;
};

const DELIVERY_BATCH = 200;

export async function runOrdersCron(now: Date = new Date()): Promise<OrdersCronReport> {
  const delayNotices = await markSupplierDelays(now);
  const deliveries = await deliverDueOrders(now);
  return { delayNotices, delivered: deliveries.delivered, pointsAwarded: deliveries.pointsAwarded };
}

// (a) Avviso una sola volta per ordine. Il tempo di evasione è quello massimo delle righe; senza righe
// (non dovrebbe capitare) si usano 3 giorni, il valore di default del prodotto.
async function markSupplierDelays(now: Date): Promise<number> {
  const rows = await dbAdmin.execute<{ id: string }>(sql`
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
    returning o.id
  `);
  if (rows.length > 0) console.warn("orders_supplier_delayed", { count: rows.length });
  return rows.length;
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
