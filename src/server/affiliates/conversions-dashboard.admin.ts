import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { conversionsCsv, type ConversionExportRow } from "@/lib/affiliate-conversions/export-csv";
import { conversionRate } from "@/lib/affiliate-conversions/metrics";
import type { ConversionPeriod } from "@/lib/affiliate-conversions/period";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";

// Dashboard e esportazione delle conversioni affiliate (passo 3.3). Solo admin: ogni funzione
// esportata chiama requireAdmin. Le funzioni load* ricevono il database e non controllano l'accesso
// (le usano i test di integrazione). Ogni tabella è una query SQL aggregata, non una per riga.
//
// Attribuzione: conversione -> click con affiliate_conversions.subid = affiliate_clicks.subid.
// Il periodo si applica a created_at dei click e a reported_at delle conversioni. La tabella per
// contesto conta le conversioni collegate riportate nel periodo anche se il click è precedente (il
// contesto è quello del click): così la somma coincide con le conversioni collegate. La tabella per
// attività conta solo le conversioni collegate a un click; quella per partner conta tutte le
// conversioni del partner; le conversioni senza click stanno nella lista a parte.
// Commissioni: somma escluse le annullate (approvate e pagate, più in attesa).

export const ACTIVITY_LIMIT = 20;
export const UNLINKED_LIMIT = 100;
// Righe massime dell'esportazione CSV: una riga in più dice che il periodo è troppo grande.
export const EXPORT_ROW_LIMIT = 50_000;

export type DashboardTotals = {
  clicks: number;
  conversions: number;
  approvedCommissionEur: string;
  pendingCommissionEur: string;
  conversionRate: number | null;
};

// Riga di una tabella per contesto o per partner: key è il contesto o il partner.
export type DashboardBreakdown = {
  key: string;
  clicks: number;
  conversions: number;
  commissionEur: string;
  conversionRate: number | null;
};

export type DashboardActivity = {
  activityId: string;
  slug: string;
  title: string;
  clicks: number;
  conversions: number;
  commissionEur: string;
  conversionRate: number | null;
};

export type UnlinkedConversion = {
  subid: string;
  partner: string;
  conversions: number;
  commissionEur: string;
  lastReportedAt: string;
};

export type ConversionDashboard = {
  period: ConversionPeriod;
  totals: DashboardTotals;
  byContext: DashboardBreakdown[];
  byPartner: DashboardBreakdown[];
  byActivity: DashboardActivity[];
  unlinked: UnlinkedConversion[];
};

const totalsRow = z.object({
  clicks: z.number(),
  conversions: z.number(),
  approved: z.string(),
  pending: z.string(),
});

const breakdownRow = z.object({
  key: z.string(),
  clicks: z.number(),
  conversions: z.number(),
  commission: z.string(),
});

const activityRow = z.object({
  activity_id: z.string(),
  slug: z.string(),
  title: z.string(),
  clicks: z.number(),
  conversions: z.number(),
  commission: z.string(),
});

const unlinkedRow = z.object({
  subid: z.string(),
  partner: z.string(),
  conversions: z.number(),
  commission: z.string(),
  last_reported_at: z.string(),
});

const exportRow = z.object({
  reported_at: z.string(),
  partner: z.string(),
  subid: z.string(),
  context: z.string().nullable(),
  activity_title: z.string().nullable(),
  amount: z.string().nullable(),
  commission: z.string().nullable(),
  status: z.string(),
});

// Transazione di dbAdmin (o la stessa cosa in un test): tutte le letture di una vista usano lo stesso snapshot.
type Db = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];

function bounds(period: ConversionPeriod): { start: string; end: string } {
  return { start: period.start.toISOString(), end: period.endExclusive.toISOString() };
}

async function loadTotals(db: Db, period: ConversionPeriod): Promise<DashboardTotals> {
  const { start, end } = bounds(period);
  const rows = await db.execute(sql`
    select
      (select count(*)::int from public.affiliate_clicks k
         where k.created_at >= ${start}::timestamptz and k.created_at < ${end}::timestamptz) as clicks,
      (select count(*)::int from public.affiliate_conversions v
         where v.reported_at >= ${start}::timestamptz and v.reported_at < ${end}::timestamptz
           and v.status <> 'cancelled') as conversions,
      (select coalesce(sum(v.commission_eur) filter (where v.status in ('approved', 'paid')), 0)::text
         from public.affiliate_conversions v
         where v.reported_at >= ${start}::timestamptz and v.reported_at < ${end}::timestamptz) as approved,
      (select coalesce(sum(v.commission_eur) filter (where v.status = 'pending'), 0)::text
         from public.affiliate_conversions v
         where v.reported_at >= ${start}::timestamptz and v.reported_at < ${end}::timestamptz) as pending
  `);
  const [row] = z.array(totalsRow).parse(rows);
  if (row === undefined) throw new Error("conversions_totals_missing");
  return {
    clicks: row.clicks,
    conversions: row.conversions,
    approvedCommissionEur: row.approved,
    pendingCommissionEur: row.pending,
    conversionRate: conversionRate(row.clicks, row.conversions),
  };
}

async function loadByContext(db: Db, period: ConversionPeriod): Promise<DashboardBreakdown[]> {
  const { start, end } = bounds(period);
  const rows = await db.execute(sql`
    with c as (
      select k.context, count(*)::int as clicks
      from public.affiliate_clicks k
      where k.created_at >= ${start}::timestamptz and k.created_at < ${end}::timestamptz
      group by k.context
    ), v as (
      select k.context,
        count(*) filter (where v.status <> 'cancelled')::int as conversions,
        coalesce(sum(v.commission_eur) filter (where v.status <> 'cancelled'), 0)::text as commission
      from public.affiliate_conversions v
      join public.affiliate_clicks k on k.subid = v.subid
      where v.reported_at >= ${start}::timestamptz and v.reported_at < ${end}::timestamptz
      group by k.context
    )
    select coalesce(c.context, v.context) as key, coalesce(c.clicks, 0)::int as clicks,
      coalesce(v.conversions, 0)::int as conversions, coalesce(v.commission, '0') as commission
    from c
    full join v on v.context = c.context
    order by clicks desc, key
  `);
  return z
    .array(breakdownRow)
    .parse(rows)
    .map((row) => ({
      key: row.key,
      clicks: row.clicks,
      conversions: row.conversions,
      commissionEur: row.commission,
      conversionRate: conversionRate(row.clicks, row.conversions),
    }));
}

async function loadByPartner(db: Db, period: ConversionPeriod): Promise<DashboardBreakdown[]> {
  const { start, end } = bounds(period);
  const rows = await db.execute(sql`
    with c as (
      select k.partner, count(*)::int as clicks
      from public.affiliate_clicks k
      where k.created_at >= ${start}::timestamptz and k.created_at < ${end}::timestamptz
      group by k.partner
    ), v as (
      select v.partner,
        count(*) filter (where v.status <> 'cancelled')::int as conversions,
        coalesce(sum(v.commission_eur) filter (where v.status <> 'cancelled'), 0)::text as commission
      from public.affiliate_conversions v
      where v.reported_at >= ${start}::timestamptz and v.reported_at < ${end}::timestamptz
      group by v.partner
    )
    select coalesce(c.partner, v.partner)::text as key, coalesce(c.clicks, 0)::int as clicks,
      coalesce(v.conversions, 0)::int as conversions, coalesce(v.commission, '0') as commission
    from c
    full join v on v.partner = c.partner
    order by coalesce(v.commission, '0')::numeric desc, key
  `);
  return z
    .array(breakdownRow)
    .parse(rows)
    .map((row) => ({
      key: row.key,
      clicks: row.clicks,
      conversions: row.conversions,
      commissionEur: row.commission,
      conversionRate: conversionRate(row.clicks, row.conversions),
    }));
}

async function loadByActivity(db: Db, period: ConversionPeriod): Promise<DashboardActivity[]> {
  const { start, end } = bounds(period);
  const rows = await db.execute(sql`
    with c as (
      select k.activity_id, count(*)::int as clicks
      from public.affiliate_clicks k
      where k.activity_id is not null
        and k.created_at >= ${start}::timestamptz and k.created_at < ${end}::timestamptz
      group by k.activity_id
    ), v as (
      select k.activity_id,
        count(*) filter (where v.status <> 'cancelled')::int as conversions,
        coalesce(sum(v.commission_eur) filter (where v.status <> 'cancelled'), 0)::text as commission
      from public.affiliate_conversions v
      join public.affiliate_clicks k on k.subid = v.subid
      where k.activity_id is not null
        and v.reported_at >= ${start}::timestamptz and v.reported_at < ${end}::timestamptz
      group by k.activity_id
    ), ids as (
      select activity_id from c
      union
      select activity_id from v
    )
    select a.id::text as activity_id, a.slug, a.title,
      coalesce(c.clicks, 0)::int as clicks,
      coalesce(v.conversions, 0)::int as conversions,
      coalesce(v.commission, '0') as commission
    from ids
    join public.activities a on a.id = ids.activity_id
    left join c on c.activity_id = ids.activity_id
    left join v on v.activity_id = ids.activity_id
    order by coalesce(v.commission, '0')::numeric desc, clicks desc, a.slug
    limit ${ACTIVITY_LIMIT}
  `);
  return z
    .array(activityRow)
    .parse(rows)
    .map((row) => ({
      activityId: row.activity_id,
      slug: row.slug,
      title: row.title,
      clicks: row.clicks,
      conversions: row.conversions,
      commissionEur: row.commission,
      conversionRate: conversionRate(row.clicks, row.conversions),
    }));
}

async function loadUnlinked(db: Db, period: ConversionPeriod): Promise<UnlinkedConversion[]> {
  const { start, end } = bounds(period);
  const rows = await db.execute(sql`
    select v.subid, v.partner::text as partner,
      count(*)::int as conversions,
      coalesce(sum(v.commission_eur) filter (where v.status <> 'cancelled'), 0)::text as commission,
      to_char(max(v.reported_at) at time zone 'UTC', 'YYYY-MM-DD') as last_reported_at
    from public.affiliate_conversions v
    where v.reported_at >= ${start}::timestamptz and v.reported_at < ${end}::timestamptz
      and v.status <> 'cancelled'
      and not exists (select 1 from public.affiliate_clicks k where k.subid = v.subid)
    group by v.subid, v.partner
    order by coalesce(sum(v.commission_eur) filter (where v.status <> 'cancelled'), 0) desc, v.subid
    limit ${UNLINKED_LIMIT}
  `);
  return z
    .array(unlinkedRow)
    .parse(rows)
    .map((row) => ({
      subid: row.subid,
      partner: row.partner,
      conversions: row.conversions,
      commissionEur: row.commission,
      lastReportedAt: row.last_reported_at,
    }));
}

// Tutte le sezioni della dashboard per il periodo dato (una query per sezione).
export async function loadConversionDashboard(db: Db, period: ConversionPeriod): Promise<ConversionDashboard> {
  const [totals, byContext, byPartner, byActivity, unlinked] = await Promise.all([
    loadTotals(db, period),
    loadByContext(db, period),
    loadByPartner(db, period),
    loadByActivity(db, period),
    loadUnlinked(db, period),
  ]);
  return { period, totals, byContext, byPartner, byActivity, unlinked };
}

export async function getConversionDashboard(period: ConversionPeriod): Promise<ConversionDashboard> {
  await requireAdmin();
  return dbAdmin.transaction((tx) => loadConversionDashboard(tx, period));
}

// Righe dell'esportazione: una per conversione del periodo, con il click collegato se c'è.
// Al massimo EXPORT_ROW_LIMIT + 1 righe: chi chiama confronta con il limite.
export async function loadConversionExportRows(db: Db, period: ConversionPeriod): Promise<ConversionExportRow[]> {
  const { start, end } = bounds(period);
  const rows = await db.execute(sql`
    select to_char(v.reported_at at time zone 'UTC', 'YYYY-MM-DD') as reported_at,
      v.partner::text as partner, v.subid, k.context, a.title as activity_title,
      v.amount_eur::text as amount, v.commission_eur::text as commission, v.status
    from public.affiliate_conversions v
    left join public.affiliate_clicks k on k.subid = v.subid
    left join public.activities a on a.id = k.activity_id
    where v.reported_at >= ${start}::timestamptz and v.reported_at < ${end}::timestamptz
    order by v.reported_at, v.partner, v.subid
    limit ${EXPORT_ROW_LIMIT + 1}
  `);
  return z
    .array(exportRow)
    .parse(rows)
    .map((row) => ({
      reportedAt: row.reported_at,
      partner: row.partner,
      subid: row.subid,
      context: row.context,
      activityTitle: row.activity_title,
      amountEur: row.amount,
      commissionEur: row.commission,
      status: row.status,
    }));
}

export type ConversionExportResult = { status: "ok"; csv: string } | { status: "too_many_rows" };

// CSV del periodo per il download (route /admin/affiliati/export). Oltre EXPORT_ROW_LIMIT righe
// non produce il file: il chiamante risponde con un errore.
export async function exportConversionsCsv(period: ConversionPeriod): Promise<ConversionExportResult> {
  await requireAdmin();
  const rows = await dbAdmin.transaction((tx) => loadConversionExportRows(tx, period));
  if (rows.length > EXPORT_ROW_LIMIT) return { status: "too_many_rows" };
  return { status: "ok", csv: conversionsCsv(rows) };
}
