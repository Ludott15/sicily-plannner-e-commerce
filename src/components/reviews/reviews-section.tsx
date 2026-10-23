import { getTranslations } from "next-intl/server";
import { ButtonLink, RewardedReviewLabel } from "@/components/design";
import type { PublicReview } from "@/server/gamification/queries";
import { POINT_DEFAULTS, REVIEW_MIN_CHARS } from "@/server/gamification/config";
import { ReportReviewButton } from "./report-review-button";
import { ReviewForm } from "./review-form";

// Recensioni dell'attività (passo 5.1, mockup Attivita.html). Le recensioni sono quelle pubbliche
// (public_reviews: nascoste escluse). Il modulo di scrittura compare solo a chi è idoneo; agli
// ospiti si chiede di creare l'account, ai visitatori di accedere.

export type ReviewViewer = "visitor" | "guest" | "user";

export async function ReviewsSection({
  activityId,
  reviews,
  mine,
  eligible,
  viewer,
}: {
  activityId: string;
  reviews: PublicReview[];
  mine: { rating: number; body: string } | null;
  eligible: boolean;
  viewer: ReviewViewer;
}) {
  const t = await getTranslations("Reviews");

  return (
    <section aria-labelledby="recensioni" className="flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="recensioni" className="is-display text-heading-1">
          {t("title")}
        </h2>
        <span className="text-body-s text-lava-muted">{t("count", { count: reviews.length })}</span>
      </div>

      {reviews.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border-control p-6">
          <p className="text-body font-semibold">{t("emptyTitle")}</p>
          <p className="text-body text-lava-muted">{t("emptyText")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {reviews.map((review) => (
            <li key={review.id}>
              <article className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-6 shadow-card">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-calce-sunk text-body font-semibold"
                  >
                    {review.displayName?.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-body font-semibold">
                      {review.authorDeleted ? t("deletedUser") : (review.displayName ?? t("anonymous"))}
                    </p>
                    <p className="text-body-s font-semibold">{t("doneThis")}</p>
                  </div>
                  <p className="text-body-s font-semibold">{t("ratingValue", { n: review.rating })}</p>
                </div>
                {review.rewarded && <RewardedReviewLabel />}
                <p className="text-body text-pretty whitespace-pre-line">{review.body}</p>
                {viewer === "user" && <ReportReviewButton reviewId={review.id} />}
              </article>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-4 border-t border-divider pt-8">
        {viewer === "guest" && (
          <>
            <p className="text-body text-lava-muted">{t("guestToReview")}</p>
            <ButtonLink href="/profilo" variant="secondary" className="self-start">
              {t("createAccount")}
            </ButtonLink>
          </>
        )}
        {viewer === "visitor" && (
          <>
            <p className="text-body text-lava-muted">{t("loginToReview")}</p>
            <ButtonLink href="/login" variant="secondary" className="self-start">
              {t("login")}
            </ButtonLink>
          </>
        )}
        {viewer === "user" && eligible && (
          <ReviewForm
            activityId={activityId}
            minChars={REVIEW_MIN_CHARS}
            points={POINT_DEFAULTS.review}
            initial={mine}
          />
        )}
        {viewer === "user" && !eligible && <p className="text-body text-lava-muted">{t("notEligible")}</p>}
      </div>
    </section>
  );
}
