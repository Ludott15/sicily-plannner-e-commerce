import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { AdminCoverBlock } from "@/components/admin/cover-block";
import { FormNotice } from "@/components/admin/fields";
import { TemplateChecks } from "@/components/admin/template-checks";
import { TemplateEditor, type EditorItem } from "@/components/admin/template-editor";
import { TemplateForm, type NightOptions, type TemplateFormValues } from "@/components/admin/template-form";
import { Link } from "@/lib/i18n/navigation";
import { getAdminMedia } from "@/server/media/admin-queries.admin";
import {
  addTemplateItem,
  deleteTemplateItem,
  reorderTemplateItems,
  saveTemplate,
  updateTemplateItem,
} from "@/server/catalog/admin-actions.admin";
import {
  adminActivityOptions,
  adminGetTemplate,
  adminListAreas,
  adminListPlaces,
} from "@/server/catalog/admin-queries.admin";

// Editor di un itinerario pronto: dati del template, controlli di pubblicazione e fatti calcolati,
// poi le tappe giorno per giorno (TemplateEditor). Il form dei dati usa saveTemplate; le tappe
// usano le azioni di template-editor.tsx.

export default async function EditTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ salvato?: string; controlli?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();

  const [t, template, activities, areas, places, { salvato, controlli }] = await Promise.all([
    getTranslations("Admin"),
    adminGetTemplate(id),
    adminActivityOptions(),
    adminListAreas(),
    adminListPlaces(),
    searchParams,
  ]);
  if (!template) notFound();
  const cover = template.coverMediaId ? await getAdminMedia(template.coverMediaId) : null;

  const values: TemplateFormValues = {
    id: template.id,
    title: template.title,
    slug: template.slug,
    days: template.days,
    subtitle: template.subtitle,
    description: template.description,
    pace: template.pace,
    seasonMonths: template.seasonMonths,
    suitableFor: template.suitableFor,
    dayTitles: template.dayTitles,
    dayIntros: template.dayIntros,
    nights: template.nights.map((night) => ({
      nightIndex: night.nightIndex,
      areaId: night.areaId,
      placeId: night.placeId,
    })),
  };

  const nightOptions: NightOptions = {
    areas: areas.map((area) => ({ id: area.id, nameIt: area.nameIt })),
    places: places.map((place) => ({ id: place.id, name: place.name })),
  };

  const editorItems: EditorItem[] = template.items.map((item) => ({
    id: item.id,
    dayIndex: item.dayIndex,
    position: item.position,
    timeSlot: item.timeSlot,
    notes: item.notes,
    label: item.activityTitle ?? item.customTitle ?? item.placeName ?? "",
    activityInactive: item.activityId !== null && item.activityIsActive === false,
  }));

  const notice = salvato ? t("saved") : controlli ? t("savedAsDraft") : null;

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{template.title}</h1>
        <div className="flex gap-4 text-body">
          <Link href="/admin/itinerari">{t("backToList")}</Link>
          {template.slug && <Link href={`/itinerari/${template.slug}`}>{t("viewPublic")}</Link>}
        </div>
      </div>
      <FormNotice message={notice} />
      <TemplateChecks checks={template.checks} facts={template.facts} days={template.days} />
      <TemplateForm action={saveTemplate} locale={locale} values={values} options={nightOptions} />
      <AdminCoverBlock cover={cover} slug={template.slug} />
      <TemplateEditor
        locale={locale}
        templateId={template.id}
        days={template.days}
        dayTitles={template.dayTitles}
        items={editorItems}
        activities={activities}
        places={places.map((place) => ({ id: place.id, name: place.name }))}
        reorderAction={reorderTemplateItems}
        updateAction={updateTemplateItem}
        addAction={addTemplateItem}
        removeAction={deleteTemplateItem}
      />
    </section>
  );
}
