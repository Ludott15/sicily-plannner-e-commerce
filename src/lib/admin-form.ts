// Stato dei form dell'admin, condiviso tra le azioni server (*.admin.ts) e i componenti client.
export type AdminErrorCode =
  | "invalid"
  | "activity_without_tags"
  | "slug_taken"
  | "partner_product_taken"
  | "day_titles_exceed_days"
  | "failed";

export type AdminFormState = { status: "idle" } | { status: "error"; code: AdminErrorCode };

export type AdminFormAction = (prev: AdminFormState, formData: FormData) => Promise<AdminFormState>;
