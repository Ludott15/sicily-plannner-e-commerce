// Tipi condivisi dalle azioni dei gruppi e dalla UI. Nessuna dipendenza dal server: il file è
// importabile anche dai componenti client (solo tipi e costanti).

// Codici d'errore delle azioni dei gruppi. I codici di dominio arrivano dal database (SQLSTATE
// P0001 con questo messaggio); gli altri sono dell'app.
export const GROUP_ERROR_CODES = [
  "invalid",
  "failed",
  "guest_not_allowed",
  "itinerary_not_available",
  "invite_not_found",
  "invite_revoked",
  "invite_expired",
  "invite_exhausted",
  "already_member",
  "group_full",
  "not_group_owner",
  "not_group_member",
  "new_owner_not_member",
  "cannot_leave_as_owner",
  "cannot_remove_owner",
  "rate_limited",
  "email_unavailable",
] as const;

export type GroupErrorCode = (typeof GROUP_ERROR_CODES)[number];

export type GroupFormState = { status: "idle" } | { status: "ok" } | { status: "error"; code: GroupErrorCode };

export type InviteLinkState = GroupFormState | { status: "created"; url: string };

export type EmailInviteState = GroupFormState | { status: "sent" };

// Limiti dei gruppi (docs/spec.md): nome 1..60 nella validazione (il database accetta 1..80),
// trenta membri proprietario incluso, link con al massimo dieci ingressi.
export const GROUP_NAME_MAX_LENGTH = 60;
export const GROUP_MAX_MEMBERS = 30;
export const INVITE_LINK_MAX_USES = 10;
export const EMAIL_INVITE_DAILY_LIMIT = 20;
