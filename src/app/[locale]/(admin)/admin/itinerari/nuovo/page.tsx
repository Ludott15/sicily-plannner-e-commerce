import { getTranslations, setRequestLocale } from "next-intl/server";
import { TemplateForm, type NightOptions } from "@/components/admin/template-form";
import { saveTemplate } from "@/server/catalog/admin-actions.admin";
import { adminListAreas, adminListPlaces } from "@/server/catalog/admin-queries.admin";

// Nuovo itinerario pronto: nasce sempre in bozza (senza slug); le tappe si aggiungono dalla
// pagina di modifica, dove ci sono anche i controlli di pubblicazione.

export default async function NewTemplatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, areas, places] = await Promise.all([getTranslations("Admin"), adminListAreas(), adminListPlaces()]);

  const options: NightOptions = {
    areas: areas.map((area) => ({ id: area.id, nameIt: area.nameIt })),
    places: places.map((place) => ({ id: place.id, name: place.name })),
  };

  return (
    <section className="flex flex-col gap-6">
      <h1 className="is-display text-heading-1">{t("newTemplate")}</h1>
      <TemplateForm
        action={saveTemplate}
        locale={locale}
        options={options}
        values={{
          title: "",
          slug: null,
          days: 3,
          subtitle: null,
          description: null,
          pace: null,
          seasonMonths: [],
          suitableFor: [],
          dayTitles: [],
          dayIntros: [],
          nights: [],
        }}
      />
    </section>
  );
}
