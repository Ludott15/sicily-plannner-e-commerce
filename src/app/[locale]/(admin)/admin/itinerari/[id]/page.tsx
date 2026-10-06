import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Field, FormNotice, Select, TextInput } from "@/components/admin/fields";
import { TemplateForm } from "@/components/admin/template-form";
import { Button } from "@/components/design";
import { AdminCoverBlock } from "@/components/admin/cover-block";
import { Link } from "@/lib/i18n/navigation";
import { getAdminMedia } from "@/server/media/admin-queries.admin";
import {
  addTemplateItem,
  deleteTemplateItem,
  moveTemplateItem,
  saveTemplate,
} from "@/server/catalog/admin-actions.admin";
import { adminActivityOptions, adminGetTemplate } from "@/server/catalog/admin-queries.admin";

// Editor di un itinerario pronto: dati e titoli dei giorni (TemplateForm), poi le tappe
// giorno per giorno. Aggiunta, spostamento e rimozione funzionano anche senza JavaScript.

export default async function EditTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ salvato?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();

  const [t, template, activities, { salvato }] = await Promise.all([
    getTranslations("Admin"),
    adminGetTemplate(id),
    adminActivityOptions(),
    searchParams,
  ]);
  if (!template) notFound();
  const cover = template.coverMediaId ? await getAdminMedia(template.coverMediaId) : null;

  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="templateId" value={template.id} />
    </>
  );

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{template.title}</h1>
        <div className="flex gap-4 text-body">
          <Link href="/admin/itinerari">{t("backToList")}</Link>
          {template.slug && <Link href={`/itinerari/${template.slug}`}>{t("viewPublic")}</Link>}
        </div>
      </div>
      <FormNotice message={salvato ? t("saved") : null} />
      <TemplateForm
        action={saveTemplate}
        locale={locale}
        values={{ id: template.id, title: template.title, slug: template.slug, days: template.days, dayTitles: template.dayTitles }}
      />
      <AdminCoverBlock cover={cover} slug={template.slug} />

      <div className="flex flex-col gap-8">
        <h2 className="is-display text-heading-2">{t("stops")}</h2>
        {Array.from({ length: template.days }, (_, day) => {
          const items = template.items.filter((i) => i.dayIndex === day);
          const title = template.dayTitles[day];
          return (
            <section key={day} id={`giorno-${day + 1}`} className="rounded-lg border border-card-edge bg-calce-raised p-6 shadow-card">
              <h3 className="text-heading-3">
                {t("day", { n: day + 1 })}
                {title ? ` · ${title}` : ""}
              </h3>
              {items.length === 0 ? (
                <p className="mt-3 text-body text-lava-muted">{t("noStops")}</p>
              ) : (
                <ol className="mt-3 flex flex-col">
                  {items.map((item, i) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-divider py-2">
                      <span className="text-body">
                        {item.startTime && (
                          <span className="mr-3 text-body-s font-semibold text-lava-muted tabular-nums">
                            {item.startTime.slice(0, 5)}
                          </span>
                        )}
                        {item.activityTitle ?? item.customTitle ?? item.placeName}
                      </span>
                      <span className="flex gap-2">
                        {(["up", "down"] as const).map((direction) => (
                          <form key={direction} action={moveTemplateItem}>
                            {hidden}
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="direction" value={direction} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              disabled={direction === "up" ? i === 0 : i === items.length - 1}
                            >
                              {t(direction === "up" ? "moveUp" : "moveDown")}
                            </Button>
                          </form>
                        ))}
                        <form action={deleteTemplateItem}>
                          {hidden}
                          <input type="hidden" name="itemId" value={item.id} />
                          <Button type="submit" variant="secondary" size="sm">
                            {t("remove")}
                          </Button>
                        </form>
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              <form action={addTemplateItem} className="mt-4 grid items-end gap-4 md:grid-cols-[2fr_2fr_1fr_auto]">
                {hidden}
                <input type="hidden" name="dayIndex" value={day} />
                <Field label={t("stopActivity")} htmlFor={`activity-${day}`}>
                  <Select id={`activity-${day}`} name="activityId" defaultValue="">
                    <option value="">—</option>
                    {activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                        {a.isActive ? "" : ` (${t("inactive")})`}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("stopCustom")} htmlFor={`custom-${day}`}>
                  <TextInput id={`custom-${day}`} name="customTitle" maxLength={120} />
                </Field>
                <Field label={t("stopTime")} htmlFor={`time-${day}`}>
                  <TextInput id={`time-${day}`} name="startTime" type="time" />
                </Field>
                <Button type="submit" variant="secondary">
                  {t("addStop")}
                </Button>
              </form>
            </section>
          );
        })}
      </div>
    </section>
  );
}
