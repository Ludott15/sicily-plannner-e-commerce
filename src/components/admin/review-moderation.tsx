"use client";

import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button, RewardedReviewLabel } from "@/components/design";
import type { AdminFormState } from "@/lib/admin-form";
import { useRouter } from "@/lib/i18n/navigation";
import { FormError } from "./fields";

// Coda di moderazione delle recensioni segnalate (passo 5.1). Ogni riga ha la propria azione:
// "Nascondi" per le recensioni visibili, "Ripristina" per quelle nascoste. Le azioni arrivano
// come prop dalla pagina admin (i moduli *.admin.ts non si importano dai componenti).

export const MODERATION_REASONS = ["spam", "offensive", "off_topic", "other"] as const;
export type ModerationReason = (typeof MODERATION_REASONS)[number];

export type ReportedReview = {
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

export type ModerationAction = (prev: AdminFormState, input: { reviewId: string }) => Promise<AdminFormState>;

export function ReportedReviewsList({
  reviews,
  hideAction,
  restoreAction,
}: {
  reviews: ReportedReview[];
  hideAction: ModerationAction;
  restoreAction: ModerationAction;
}) {
  return (
    <ul className="flex flex-col gap-4">
      {reviews.map((review) => (
        <li key={review.id}>
          <ReportedReviewRow review={review} action={review.hidden ? restoreAction : hideAction} />
        </li>
      ))}
    </ul>
  );
}

function ReportedReviewRow({ review, action }: { review: ReportedReview; action: ModerationAction }) {
  const t = useTranslations("AdminReviews");
  const router = useRouter();
  const [state, dispatch, pending] = useActionState(action, { status: "idle" });
  // Dopo il salvataggio la pagina si ricarica: la lista riflette lo stato nuovo della recensione.
  useEffect(() => {
    if (state.status === "saved") router.refresh();
  }, [state, router]);
  const reasons = review.reasons.flatMap((reason) =>
    (MODERATION_REASONS as readonly string[]).includes(reason) ? [t(`reasons.${reason}`)] : [],
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    startTransition(() => dispatch({ reviewId: review.id }));
  }

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-body font-semibold">{review.activityTitle}</p>
        <p className="text-body-s">
          {review.hidden ? t("hidden") : t("visible")} · {t("rating", { n: review.rating })}
        </p>
      </div>
      <p className="text-body-s text-lava-muted">
        {t("reportsCount", { count: review.reportCount })}
        {reasons.length > 0 && ` · ${t("reasonsLabel", { reasons: reasons.join(", ") })}`}
      </p>
      {review.rewarded && <RewardedReviewLabel />}
      <p className="text-body text-pretty whitespace-pre-line">{review.body}</p>
      <p className="text-caption text-lava-muted">{review.displayName ?? t("anonymous")}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <FormError message={state.status === "error" ? t("failed") : null} />
        {state.status === "saved" && (
          <p role="status" className="text-body-s">
            {t("saved")}
          </p>
        )}
        <div>
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {review.hidden ? t("restore") : t("hide")}
          </Button>
        </div>
      </form>
    </article>
  );
}
