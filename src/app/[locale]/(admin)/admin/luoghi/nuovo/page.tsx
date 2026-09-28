import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlaceForm } from "@/components/admin/place-form";
import { savePlace } from "@/server/catalog/admin-actions.admin";

export default async function NewPlacePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin");

  return (
    <section className="flex flex-col gap-6">
      <h1 className="is-display text-heading-1">{t("newPlace")}</h1>
      <PlaceForm
        action={savePlace}
        locale={locale}
        values={{ name: "", slug: "", province: "PA", lat: null, lng: null, description: null, coverImage: null }}
      />
    </section>
  );
}
