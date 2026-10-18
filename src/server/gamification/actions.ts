"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routing } from "@/lib/i18n/routing";
import { requireUser } from "@/server/auth";
import { setConsent } from "@/server/privacy/consents";
import { REPORT_REASONS, type ReportReason } from "./config";
import { recordCheckIn, reportReview, submitReview } from "./core";
import type { CheckInResult, ReportReviewState, ReviewFormState } from "./types";

// Azioni dei punti (passo 5.1): Zod, poi requireUser, poi la logica in ./core (dbAsUser).
// Gli ospiti passano requireUser: le funzioni SQL li respingono con guest_not_allowed.

const checkInSchema = z.object({
  itemId: z.uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const reviewSchema = z.object({
  activityId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  text: z.string().max(4000),
  locale: z.enum(routing.locales),
});

const reportSchema = z.object({
  reviewId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
});

export async function checkInAction(input: { itemId: string; lat: number; lng: number }): Promise<CheckInResult> {
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  // La posizione arriva solo dopo il dialogo di consenso del check-in: quella scelta si registra
  // (passo 8.2). Le coordinate non si salvano, né qui né altrove.
  try {
    await setConsent(user, "location", true);
  } catch {
    return { status: "error", code: "failed" };
  }
  const result = await recordCheckIn(user, parsed.data);
  if (result.status === "ok") {
    revalidatePath("/[locale]/viaggi/[id]", "page");
    revalidatePath("/[locale]/punti", "page");
  }
  return result;
}

export async function submitReviewAction(
  _prev: ReviewFormState,
  input: { activityId: string; rating: number; text: string; locale: string },
): Promise<ReviewFormState> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "rating") return { status: "error", code: "invalid_rating" };
    if (field === "text") return { status: "error", code: "invalid_text" };
    return { status: "error", code: "invalid" };
  }
  const user = await requireUser();
  const result = await submitReview(user, {
    activityId: parsed.data.activityId,
    rating: parsed.data.rating,
    text: parsed.data.text,
  });
  if (result.status === "saved") {
    revalidatePath(`/${parsed.data.locale}/punti`);
    revalidatePath("/[locale]/attivita/[slug]", "page");
  }
  return result;
}

export async function reportReviewAction(
  _prev: ReportReviewState,
  input: { reviewId: string; reason: ReportReason },
): Promise<ReportReviewState> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  return reportReview(user, parsed.data);
}
