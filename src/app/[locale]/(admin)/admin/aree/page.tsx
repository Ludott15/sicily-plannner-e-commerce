import { getTranslations, setRequestLocale } from "next-intl/server";
import { AreaDescriptionForm } from "@/components/admin/area-description-form";
import { listAreasForEdit } from "@/server/editorial/admin-queries.admin";
import { saveAreaDescription } from "@/server/catalog/area-actions.admin";

// Descrizioni delle aree di viaggio, in italiano e inglese. Ogni area è un form a sé.
export default async function AdminAreasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, areas] = await Promise.all([getTranslations("Admin"), listAreasForEdit()]);

  return (
    <section className="flex flex-col gap-10">
      <h1 className="is-display text-heading-1">{t("areas.title")}</h1>
      <p className="text-body text-lava-muted">{t("areas.intro")}</p>
      {areas.map((area) => (
        <section key={area.id} aria-labelledby={`area-${area.id}`} className="flex flex-col gap-4 border-b border-divider pb-10">
          <h2 id={`area-${area.id}`} className="is-display text-heading-2">
            {locale === "en" ? area.nameEn : area.nameIt}
          </h2>
          <AreaDescriptionForm
            action={saveAreaDescription}
            areaId={area.id}
            descriptionIt={area.descriptionIt}
            descriptionEn={area.descriptionEn}
          />
        </section>
      ))}
    </section>
  );
}
