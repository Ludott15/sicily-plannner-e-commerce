import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { matchCode, parseJsonbPayload, pgErrorMessage } from "./pg";
import type { ReportReason } from "./config";
import type {
  CheckInErrorCode,
  CheckInResult,
  ReportErrorCode,
  ReportReviewState,
  ReviewErrorCode,
  ReviewFormState,
} from "./types";

// Logica dei punti chiamata dalle Server Actions (dopo requireUser) e dai test di integrazione.
// Tutto passa da dbAsUser: la RLS e le funzioni SQL SECURITY DEFINER decidono.
// Mai registrare coordinate o testi: i messaggi d'errore del driver includono i parametri.

export type CheckInInput = { itemId: string; lat: number; lng: number };
export type ReviewInput = { activityId: string; rating: number; text: string };
export type ReportInput = { reviewId: string; reason: ReportReason };

// Codici di dominio sollevati da record_check_in, submit_review e report_review.
const CHECK_IN_CODES = [
  "guest_not_allowed",
  "not_allowed",
  "no_place",
  "too_far",
  "daily_limit",
  "already_checked_in",
  "invalid_position",
] as const;
const REVIEW_CODES = [
  "guest_not_allowed",
  "invalid_rating",
  "invalid_text",
  "activity_not_available",
  "not_eligible",
] as const;
const REPORT_CODES = ["guest_not_allowed", "cannot_report_own", "invalid_reason", "review_not_found"] as const;

const checkInPayload = z.object({
  checkInId: z.string(),
  points: z.number().int(),
  itineraryCompleted: z.boolean(),
});
const reviewPayload = z.object({ reviewId: z.string(), rewarded: z.boolean() });

function checkInErrorCode(code: (typeof CHECK_IN_CODES)[number] | null): CheckInErrorCode {
  if (code === null) return "failed";
  return code === "invalid_position" ? "invalid" : code;
}

function reviewErrorCode(code: (typeof REVIEW_CODES)[number] | null): ReviewErrorCode {
  return code ?? "failed";
}

function reportErrorCode(code: (typeof REPORT_CODES)[number] | null): ReportErrorCode {
  if (code === null || code === "review_not_found") return "failed";
  return code === "invalid_reason" ? "invalid" : code;
}

export async function recordCheckIn(user: DbUser, input: CheckInInput): Promise<CheckInResult> {
  try {
    const [row] = await dbAsUser(user, (tx) =>
      tx.execute<{ result: unknown }>(
        sql`select public.record_check_in(${input.itemId}::uuid, ${input.lat}::double precision, ${input.lng}::double precision) as result`,
      ),
    );
    const parsed = checkInPayload.safeParse(parseJsonbPayload(row?.result));
    if (!parsed.success) return { status: "error", code: "failed" };
    return { status: "ok", points: parsed.data.points, itineraryCompleted: parsed.data.itineraryCompleted };
  } catch (error) {
    return { status: "error", code: checkInErrorCode(matchCode(pgErrorMessage(error), CHECK_IN_CODES)) };
  }
}

export async function submitReview(user: DbUser, input: ReviewInput): Promise<ReviewFormState> {
  try {
    const [row] = await dbAsUser(user, (tx) =>
      tx.execute<{ result: unknown }>(
        sql`select public.submit_review(${input.activityId}::uuid, ${input.rating}::smallint, ${input.text}::text) as result`,
      ),
    );
    const parsed = reviewPayload.safeParse(parseJsonbPayload(row?.result));
    if (!parsed.success) return { status: "error", code: "failed" };
    return { status: "saved", rewarded: parsed.data.rewarded };
  } catch (error) {
    return { status: "error", code: reviewErrorCode(matchCode(pgErrorMessage(error), REVIEW_CODES)) };
  }
}

export async function reportReview(user: DbUser, input: ReportInput): Promise<ReportReviewState> {
  try {
    await dbAsUser(user, (tx) =>
      tx.execute(sql`select public.report_review(${input.reviewId}::uuid, ${input.reason}::text)`),
    );
    return { status: "reported" };
  } catch (error) {
    return { status: "error", code: reportErrorCode(matchCode(pgErrorMessage(error), REPORT_CODES)) };
  }
}
