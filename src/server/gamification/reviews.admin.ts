"use server";

import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminFormState } from "@/lib/admin-form";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { activities, adminAuditLog, pointsLedger, profiles, reviewReports, reviews } from "@/server/db/schema";
import type { AdminReportedReview } from "./types";

// Moderazione delle recensioni (passo 5.1). Ogni azione: Zod, poi requireAdmin, poi dbAdmin in
// transazione, con una riga in admin_audit_log. Le recensioni nascoste escono dalla vista
// pubblica (public_reviews) e restano nel database.

const reviewIdSchema = z.object({ reviewId: z.uuid() });

export async function listReportedReviews(): Promise<AdminReportedReview[]> {
  await requireAdmin();
  const rows = await dbAdmin
    .select({
      id: reviews.id,
      body: reviews.body,
      rating: reviews.rating,
      activityTitle: activities.title,
      displayName: profiles.displayName,
      rewarded: sql<boolean>`exists (
        select 1 from ${pointsLedger} pl
        where pl.user_id = ${reviews.userId} and pl.reason = 'review' and pl.ref_id = ${reviews.activityId}
      )`,
      hidden: sql<boolean>`${reviews.hiddenAt} is not null`,
      reportCount: sql<number>`count(${reviewReports.id})::int`,
      reasons: sql<string[]>`array_agg(distinct ${reviewReports.reason})`,
    })
    .from(reviewReports)
    .innerJoin(reviews, eq(reviews.id, reviewReports.reviewId))
    .innerJoin(activities, eq(activities.id, reviews.activityId))
    .innerJoin(profiles, eq(profiles.id, reviews.userId))
    .groupBy(reviews.id, activities.title, profiles.displayName)
    .orderBy(desc(sql`count(${reviewReports.id})`), desc(sql`max(${reviewReports.createdAt})`));

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    rating: r.rating,
    activityTitle: r.activityTitle,
    displayName: r.displayName,
    rewarded: r.rewarded,
    hidden: r.hidden,
    reportCount: r.reportCount,
    reasons: r.reasons,
  }));
}

async function setHidden(input: { reviewId: string }, hidden: boolean): Promise<AdminFormState> {
  const parsed = reviewIdSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { user } = await requireAdmin();

  const done = await dbAdmin.transaction(async (tx) => {
    const [row] = await tx
      .update(reviews)
      .set(hidden ? { hiddenAt: new Date(), hiddenBy: user.id } : { hiddenAt: null, hiddenBy: null })
      .where(eq(reviews.id, parsed.data.reviewId))
      .returning({ activityId: reviews.activityId });
    if (!row) return false;
    await tx.insert(adminAuditLog).values({
      actorId: user.id,
      action: hidden ? "review.hide" : "review.restore",
      entity: "reviews",
      entityId: parsed.data.reviewId,
      diff: { activity_id: row.activityId },
    });
    return true;
  });

  if (!done) return { status: "error", code: "failed" };
  revalidatePath("/[locale]/admin/recensioni", "page");
  revalidatePath("/[locale]/attivita/[slug]", "page");
  return { status: "saved" };
}

export async function hideReview(_prev: AdminFormState, input: { reviewId: string }): Promise<AdminFormState> {
  return setHidden(input, true);
}

export async function restoreReview(_prev: AdminFormState, input: { reviewId: string }): Promise<AdminFormState> {
  return setHidden(input, false);
}
