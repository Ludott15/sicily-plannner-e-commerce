import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActivityForm } from "@/components/admin/activity-form";
import { saveActivity } from "@/server/catalog/admin-actions.admin";
import { adminListInterests, adminListPlaces } from "@/server/catalog/admin-queries.admin";

export default async function NewActivityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, places, interests] = await Promise.all([getTranslations("Admin"), adminListPlaces(), adminListInterests()]);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="is-display text-heading-1">{t("newActivity")}</h1>
      <ActivityForm
        action={saveActivity}
        locale={locale}
        places={places}
        interests={interests.map((i) => ({ key: i.key, label: locale === "en" ? i.labelEn : i.labelIt }))}
        values={{
          title: "",
          slug: "",
          placeId: "",
          description: null,
          durationMin: null,
          onSitePriceEur: null,
          requiresCar: false,
          accessible: false,
          dietFriendly: [],
          seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          rating: null,
          isActive: false,
          tags: [],
        }}
      />
    </section>
  );
}
