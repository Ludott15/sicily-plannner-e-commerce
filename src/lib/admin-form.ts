// Stato dei form dell'admin, condiviso tra le azioni server (*.admin.ts) e i componenti client.
export type AdminErrorCode =
  | "invalid"
  | "activity_without_tags"
  | "activity_place_inactive"
  | "place_has_active_activities"
  | "slug_taken"
  | "partner_product_taken"
  | "day_titles_exceed_days"
  | "person_tip_without_relation"
  | "author_without_consent"
  | "author_license_required"
  | "heritage_without_authorization"
  | "authorization_expired"
  | "authorization_in_use"
  | "svg_must_be_illustration"
  | "failed";

// "saved": salvataggio riuscito senza cambio di pagina (righe della tabella dei media).
export type AdminFormState = { status: "idle" } | { status: "saved" } | { status: "error"; code: AdminErrorCode };

export type AdminFormAction = (prev: AdminFormState, formData: FormData) => Promise<AdminFormState>;
