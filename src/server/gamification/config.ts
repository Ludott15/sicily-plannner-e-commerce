// Valori del passo 5.1 (punti, check-in, recensioni). Specchio delle regole nel database:
// point_rules (seed in supabase/migrations/20261015174623_punti_recensioni.sql) e le soglie letterali nelle funzioni SQL
// record_check_in, submit_review e report_review. Cambiare un valore vuol dire cambiarlo in
// entrambi i posti (e nella migrazione).

export const POINT_REASONS = [
  "profile_completed",
  "invite_accepted",
  "review",
  "check_in",
  "itinerary_completed",
  "order",
  "redeem",
  "redeem_refund",
  "admin_adjust",
] as const;
export type PointReason = (typeof POINT_REASONS)[number];

// Punti delle azioni guadagnabili dall'utente (tabella point_rules).
export const POINT_DEFAULTS = {
  profile_completed: 50,
  invite_accepted: 100,
  itinerary_completed: 100,
  review: 20,
  check_in: 10,
} as const;

// Check-in: distanza massima dal luogo, limite giornaliero (ora italiana), luoghi distinti
// per il premio dell'itinerario.
export const CHECK_IN_RADIUS_M = 300;
export const CHECK_INS_PER_DAY = 5;
export const ITINERARY_CHECK_INS_MIN = 3;
export const CHECK_IN_TIME_ZONE = "Europe/Rome";

// Recensioni: il premio richiede un testo di almeno REVIEW_MIN_CHARS caratteri.
export const REVIEW_MIN_CHARS = 80;
export const REVIEW_MAX_CHARS = 4000;

export const REPORT_REASONS = ["spam", "offensive", "off_topic", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
