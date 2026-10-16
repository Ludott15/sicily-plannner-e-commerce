import "server-only";
import { sql } from "drizzle-orm";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { costOf } from "@/server/chat/stats.admin";
import type { DashboardRange } from "./range";

export { parseDashboardRange } from "./range";
export type { DashboardRange } from "./range";

// Dashboard admin (M11, roadmap 10.1). Ruolo postgres (dbAdmin), solo dopo requireAdmin.
// Solo conteggi e somme, nessun dato personale. Il periodo è in date del calendario di Roma,
// estremi inclusi: da 00:00 del primo giorno a 00:00 del giorno dopo l'ultimo (Europe/Rome).

export type DashboardMetrics = {
  newUsers: number; // account non ospiti creati nel periodo
  guestsConverted: number; // ospiti diventati account nel periodo
  tripsCreated: number; // itinerari degli utenti (non modelli pronti) creati nel periodo
  tripsWithAffiliateClick: number; // di questi, con almeno un click affiliato
  affiliateClicks: number;
  commissionsCents: number; // conversioni confermate nel periodo
  orders: number; // ordini pagati (0 finché non c'è lo shop)
  avgOrderCents: number | null;
  activeUsers: number; // utenti con almeno un evento o un messaggio in chat nel periodo
  aiCostUsd: number; // dalla stessa stima di /admin/ai (AI_PRICES)
  aiCostPerActiveUserUsd: number | null;
  invitesSent: number; // link e email d'invito creati
  invitesAccepted: number; // ingressi in gruppo da invito
};

type Row = {
  new_users: number;
  guests_converted: number;
  trips_created: number;
  trips_with_click: number;
  affiliate_clicks: number;
  commissions_cents: number | string;
  orders: number;
  avg_order_cents: number | string | null;
  active_users: number;
  input_tokens: number | string;
  output_tokens: number | string;
  invites_sent: number;
  invites_accepted: number;
};

// Una sola query con sottoselezioni: un round trip e nessun conteggio in memoria.
export async function adminDashboard(range: DashboardRange): Promise<DashboardMetrics> {
  await requireAdmin();
  const lo = sql`((${range.from}::date)::timestamp at time zone 'Europe/Rome')`;
  const hi = sql`((${range.to}::date + 1)::timestamp at time zone 'Europe/Rome')`;
  const rows = await dbAdmin.execute<Row>(sql`
    select
      -- Utenti: account non ospite creato nel periodo.
      (select count(*)::int from auth.users u
        where not u.is_anonymous and u.created_at >= ${lo} and u.created_at < ${hi}) as new_users,
      -- Ospiti convertiti (approssimazione): lo schema non registra la data della conversione.
      -- Regola: account non ospite con email confermata nel periodo e creato più di un'ora prima di
      -- quella conferma. Con l'accesso a codice un account nuovo si conferma in pochi minuti, ma chi
      -- inserisce il codice dopo un'ora viene contato: il dato è indicativo, non esatto.
      (select count(*)::int from auth.users u
        where not u.is_anonymous
          and u.email_confirmed_at >= ${lo} and u.email_confirmed_at < ${hi}
          and u.created_at < u.email_confirmed_at - interval '1 hour') as guests_converted,
      -- Viaggi: itinerari degli utenti creati nel periodo, esclusi i modelli pronti.
      (select count(*)::int from public.itineraries i
        where i.owner_id is not null and not i.is_template
          and i.created_at >= ${lo} and i.created_at < ${hi}) as trips_created,
      (select count(*)::int from public.itineraries i
        where i.owner_id is not null and not i.is_template
          and i.created_at >= ${lo} and i.created_at < ${hi}
          and exists (select 1 from public.affiliate_clicks c where c.itinerary_id = i.id)) as trips_with_click,
      (select count(*)::int from public.affiliate_clicks c
        where c.created_at >= ${lo} and c.created_at < ${hi}) as affiliate_clicks,
      -- Commissioni in centesimi: conversioni approvate o pagate, per data di segnalazione.
      (select coalesce(round(sum(ac.commission_eur) * 100), 0)::bigint from public.affiliate_conversions ac
        where ac.status in ('approved', 'paid') and ac.reported_at >= ${lo} and ac.reported_at < ${hi}) as commissions_cents,
      -- Ordini pagati: esclusi annullati e rimborsati.
      (select count(*)::int from public.orders o
        where o.status in ('paid', 'sent_to_producer', 'shipped', 'delivered')
          and o.created_at >= ${lo} and o.created_at < ${hi}) as orders,
      (select round(avg(o.total_cents))::int from public.orders o
        where o.status in ('paid', 'sent_to_producer', 'shipped', 'delivered')
          and o.created_at >= ${lo} and o.created_at < ${hi}) as avg_order_cents,
      -- Utenti attivi: almeno un evento o un messaggio in chat nel periodo.
      (select count(distinct x.user_id)::int from (
          select e.user_id from public.user_events e where e.created_at >= ${lo} and e.created_at < ${hi}
          union
          select s.user_id from public.chat_messages m
            join public.chat_sessions s on s.id = m.session_id
          where m.created_at >= ${lo} and m.created_at < ${hi}
        ) x) as active_users,
      -- Costo AI: token delle risposte del chatbot, come in /admin/ai (riassunti esclusi).
      (select coalesce(sum(m.input_tokens), 0)::bigint from public.chat_messages m
        where m.role = 'assistant' and coalesce(m.content->>'kind', '') <> 'summary'
          and m.created_at >= ${lo} and m.created_at < ${hi}) as input_tokens,
      (select coalesce(sum(m.output_tokens), 0)::bigint from public.chat_messages m
        where m.role = 'assistant' and coalesce(m.content->>'kind', '') <> 'summary'
          and m.created_at >= ${lo} and m.created_at < ${hi}) as output_tokens,
      -- Inviti: link ed email creati; ingressi in gruppo con un invito.
      (select count(*)::int from public.group_invites g
        where g.created_at >= ${lo} and g.created_at < ${hi}) as invites_sent,
      (select count(*)::int from public.group_members gm
        where gm.invited_by is not null and gm.joined_at >= ${lo} and gm.joined_at < ${hi}) as invites_accepted`);

  const row = rows[0];
  if (!row) throw new Error("dashboard: nessuna riga di metriche");
  const activeUsers = Number(row.active_users);
  const aiCostUsd = costOf(Number(row.input_tokens), Number(row.output_tokens));
  return {
    newUsers: row.new_users,
    guestsConverted: row.guests_converted,
    tripsCreated: row.trips_created,
    tripsWithAffiliateClick: row.trips_with_click,
    affiliateClicks: row.affiliate_clicks,
    commissionsCents: Number(row.commissions_cents),
    orders: row.orders,
    avgOrderCents: row.avg_order_cents === null ? null : Number(row.avg_order_cents),
    activeUsers,
    aiCostUsd,
    aiCostPerActiveUserUsd: activeUsers > 0 ? Math.round((aiCostUsd / activeUsers) * 10_000) / 10_000 : null,
    invitesSent: row.invites_sent,
    invitesAccepted: row.invites_accepted,
  };
}
