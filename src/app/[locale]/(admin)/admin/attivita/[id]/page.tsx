import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { ActivityForm } from "@/components/admin/activity-form";
import { FormNotice } from "@/components/admin/fields";
import { Link } from "@/lib/i18n/navigation";
import { saveActivity } from "@/server/catalog/admin-actions.admin";
import { adminGetActivity, adminListInterests, adminListPlaces } from "@/server/catalog/admin-queries.admin";

export default async function EditActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ salvata?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();

  const [t, activity, places, interests, { salvata }] = await Promise.all([
    getTranslations("Admin"),
    adminGetActivity(id),
    adminListPlaces(),
    adminListInterests(),
    searchParams,
  ]);
  if (!activity) notFound();

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
          slug: activity.slug,
          placeId: activity.placeId,
          description: activity.description,
          durationMin: activity.durationMin,
          priceFromEur: activity.priceFromEur,
          requiresCar: activity.requiresCar,
          accessible: activity.accessible,
          seasonMonths: activity.seasonMonths,
          partner: activity.partner,
          partnerProductId: activity.partnerProductId,
          affiliateUrl: activity.affiliateUrl,
          rating: activity.rating,
          isActive: activity.isActive,
          tags: activity.tags,
        }}
      />
    </section>
  );
}
