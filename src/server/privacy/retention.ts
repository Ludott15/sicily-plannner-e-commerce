// Tempi di conservazione (passo 8.2). Documentati in docs/PRIVACY-TECNICA.md. Le chiavi sono quelle
// lette da public.apply_retention (supabase/migrations/20261016215936_gdpr_rls.sql): cambiarle vuol
// dire cambiare anche quella funzione SQL. Nessun accesso al database qui: il lavoro sta in
// retention.admin.ts.

export const RETENTION = {
  // Chat senza messaggi da 12 mesi (eliminata con i messaggi).
  chatSessionMonths: 12,
  // Eventi di uso (profilazione) oltre 18 mesi.
  userEventMonths: 18,
  // Click affiliati: dopo 26 mesi si tolgono utente e anon_id; le statistiche restano.
  affiliateClickMonths: 26,
  // Inviti scaduti da oltre 30 giorni.
  groupInviteDays: 30,
  // Ricerche senza risultato non viste da 12 mesi.
  searchMissMonths: 12,
  // Notifiche lette da oltre 6 mesi.
  notificationReadMonths: 6,
  // Ordini: email e indirizzo di spedizione per 10 anni (art. 2220 c.c.), poi anonimizzati.
  orderDataYears: 10,
} as const;

export const RETENTION_JOBS = [
  "chat_sessions",
  "user_events",
  "affiliate_clicks",
  "group_invites",
  "search_misses",
  "notifications",
  "orders_personal_data",
] as const;

export type RetentionJob = (typeof RETENTION_JOBS)[number];

export function isRetentionJob(value: string): value is RetentionJob {
  return (RETENTION_JOBS as readonly string[]).includes(value);
}
