import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { ActivityForm } from "@/components/admin/activity-form";
import { OfferForm } from "@/components/admin/offer-form";
import { FormNotice } from "@/components/admin/fields";
import { AdminCoverBlock } from "@/components/admin/cover-block";
import { Link } from "@/lib/i18n/navigation";
import { getAdminMedia } from "@/server/media/admin-queries.admin";
import { deleteOffer, saveActivity, saveOffer } from "@/server/catalog/admin-actions.admin";
import {
  adminGetActivity,
  adminListInterests,
  adminListOffers,
  adminListPlaces,
} from "@/server/catalog/admin-queries.admin";

export default async function EditActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ salvata?: string; offerta?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();

  const [t, activity, places, interests, offers, { salvata, offerta }] = await Promise.all([
    getTranslations("Admin"),
    adminGetActivity(id),
    adminListPlaces(),
    adminListInterests(),
    adminListOffers(id),
    searchParams,
  ]);
  if (!activity) notFound();
  const cover = activity.coverMediaId ? await getAdminMedia(activity.coverMediaId) : null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{activity.title}</h1>
        <div className="flex gap-4 text-body">
          <Link href="/admin/attivita">{t("backToList")}</Link>
          {activity.isActive && <Link href={`/attivita/${activity.slug}`}>{t("viewPublic")}</Link>}
        </div>
      </div>
      <FormNotice message={salvata ? t("saved") : null} />
      <ActivityForm
        action={saveActivity}
        locale={locale}
        places={places}
        interests={interests.map((i) => ({ key: i.key, label: locale === "en" ? i.labelEn : i.labelIt }))}
        values={{
          id: activity.id,
          title: activity.title,
          titleEn: activity.titleEn ?? "",
          slug: activity.slug,
          placeId: activity.placeId,
          description: activity.description,
          durationMin: activity.durationMin,
          onSitePriceEur: activity.onSitePriceEur,
          requiresCar: activity.requiresCar,
          accessible: activity.accessible,
          dietFriendly: activity.dietFriendly,
          seasonMonths: activity.seasonMonths,
          rating: activity.rating,
          isActive: activity.isActive,
          needsReview: activity.needsReview,
          sourceUrl: activity.sourceUrl ?? "",
          notes: activity.notes ?? "",
          tags: activity.tags,
        }}
      />
      <AdminCoverBlock cover={cover} slug={activity.slug} />

      <section id="offerte" aria-labelledby="offerte-titolo" className="flex flex-col gap-4 border-t border-divider pt-8">
        <h2 id="offerte-titolo" className="is-display text-heading-2">
          {t("offersTitle")}
        </h2>
        <p className="text-body-s text-lava-muted">{t("offersHint")}</p>
        <FormNotice
          message={offerta === "salvata" ? t("offerSaved") : offerta === "eliminata" ? t("offerDeleted") : null}
        />
        {offers.length === 0 && <p className="text-body">{t("offersEmpty")}</p>}
        {offers.map((o) => (
          <OfferForm
            key={o.id}
            action={saveOffer}
            deleteAction={deleteOffer}
            locale={locale}
            activityId={activity.id}
            values={o}
          />
        ))}
        <h3 className="text-body font-semibold">{t("offerNew")}</h3>
        <OfferForm
          action={saveOffer}
          locale={locale}
          activityId={activity.id}
          values={{
            partner: "getyourguide",
            partnerProductId: "",
            title: "",
            priceFromEur: null,
            currency: "EUR",
            affiliateUrl: "",
            rating: null,
            reviewsCount: null,
            freeCancellation: null,
            isActive: true,
          }}
        />
      </section>
    </section>
  );
}
