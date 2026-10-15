import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReportedReviewsList } from "@/components/admin/review-moderation";
import { hideReview, listReportedReviews, restoreReview } from "@/server/gamification/reviews.admin";

// Recensioni segnalate (passo 5.1): coda di moderazione. Le recensioni nascoste restano qui,
// con "Ripristina", finché un admin non le riporta visibili. Ogni azione finisce nel registro admin.
export default async function AdminReviewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, reviews] = await Promise.all([getTranslations("AdminReviews"), listReportedReviews()]);

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("title")}</h1>
        <p className="text-body-s text-lava-muted">{t("intro")}</p>
      </div>
      {reviews.length === 0 ? (
        <p className="text-body">{t("empty")}</p>
      ) : (
        <ReportedReviewsList reviews={reviews} hideAction={hideReview} restoreAction={restoreReview} />
      )}
    </section>
  );
}
