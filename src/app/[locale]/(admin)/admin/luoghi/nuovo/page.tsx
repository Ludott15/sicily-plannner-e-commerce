import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlaceForm } from "@/components/admin/place-form";
import { savePlace } from "@/server/catalog/admin-actions.admin";
import { adminListAreas } from "@/server/catalog/admin-queries.admin";

export default async function NewPlacePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, areas] = await Promise.all([getTranslations("Admin"), adminListAreas()]);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="is-display text-heading-1">{t("newPlace")}</h1>
      <PlaceForm
        action={savePlace}
        locale={locale}
        values={{
          name: "",
          slug: "",
          province: "PA",
          areaId: null,
          lat: null,
          lng: null,
          description: null,
          taglineIt: "",
          isActive: true,
          needsReview: false,
        }}
        areas={areas.map((a) => ({ id: a.id, name: locale === "en" ? a.nameEn : a.nameIt }))}
      />
    </section>
  );
}
