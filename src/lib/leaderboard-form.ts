// Stato del form delle impostazioni della classifica (opt-out e nome pubblico), condiviso tra le
// Server Actions di src/server/gamification/leaderboard-actions.ts e i componenti client.
export type SettingsErrorCode = "invalid" | "guest_not_allowed" | "failed";

export type SettingsFormState = { status: "idle" } | { status: "saved" } | { status: "error"; code: SettingsErrorCode };
