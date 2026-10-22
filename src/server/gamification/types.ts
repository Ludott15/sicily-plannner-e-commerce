import type { PointReason, ReportReason } from "./config";

// Tipi condivisi tra server e componenti client (solo tipi: nessun codice server).

export type CheckInErrorCode =
  | "invalid"
  | "guest_not_allowed"
  | "not_allowed"
  | "no_place"
  | "too_far"
  | "daily_limit"
  | "already_checked_in"
  | "failed";

export type CheckInResult =
  | { status: "ok"; points: number; itineraryCompleted: boolean }
  | { status: "error"; code: CheckInErrorCode };

export type ReviewErrorCode =
  | "invalid"
  | "guest_not_allowed"
  | "invalid_rating"
  | "invalid_text"
  | "activity_not_available"
  | "not_eligible"
  | "rate_limited"
  | "failed";

export type ReviewFormState =
  | { status: "idle" }
  | { status: "saved"; rewarded: boolean }
  | { status: "error"; code: ReviewErrorCode };

export type ReportReviewState =
  | { status: "idle" }
  | { status: "reported" }
  | { status: "error"; code: "invalid" | "guest_not_allowed" | "cannot_report_own" | "rate_limited" | "failed" };

export type PointMovement = {
  id: string;
  reason: string;
  delta: number;
  createdAt: string;
};

// Badge non ancora ottenuti con il progresso verso la soglia (passo 5.2). current è fermo a target.
export type NextBadge = {
  key: string;
  name: string;
  current: number;
  target: number;
};

export type MyPoints = {
  balance: number;
  movements: PointMovement[];
  rules: Record<string, number>;
  nextBadges: NextBadge[];
};

export type PublicReview = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: string;
  displayName: string | null;
  avatarUrl: string | null;
  rewarded: boolean;
  // Autore eliminato dal proprio account (passo 8.2): la recensione resta, senza nome.
  authorDeleted: boolean;
};

export type ActivityReviews = {
  reviews: PublicReview[];
  mine: { rating: number; body: string | null } | null;
  eligible: boolean;
};

export type AdminReportedReview = {
  id: string;
  body: string | null;
  rating: number;
  activityTitle: string;
  displayName: string | null;
  rewarded: boolean;
  hidden: boolean;
  reportCount: number;
  reasons: string[];
};

export type { PointReason, ReportReason };

// Codici d'errore della segnalazione di una recensione.
export type ReportErrorCode = Extract<ReportReviewState, { status: "error" }>["code"];
