import { getTranslations, setRequestLocale } from "next-intl/server";
import { TemplateForm } from "@/components/admin/template-form";
import { saveTemplate } from "@/server/catalog/admin-actions.admin";

export default async function NewTemplatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin");

  return (
    <section className="flex flex-col gap-6">
      <h1 className="is-display text-heading-1">{t("newTemplate")}</h1>
      <TemplateForm action={saveTemplate} locale={locale} values={{ title: "", slug: null, days: 3, dayTitles: [] }} />
    </section>
  );
}
