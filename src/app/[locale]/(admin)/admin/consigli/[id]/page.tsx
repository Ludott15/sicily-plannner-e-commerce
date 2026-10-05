import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { TipForm } from "@/components/admin/tip-forms";
import { Link } from "@/lib/i18n/navigation";
import { adminListPlaces } from "@/server/catalog/admin-queries.admin";
import { saveTip } from "@/server/catalog/admin-tips-actions.admin";
import { adminGetTip, adminListActivityOptions, adminListAuthors } from "@/server/catalog/admin-tips-queries.admin";

export default async function EditTipPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, tip, authors, activities, places] = await Promise.all([
    getTranslations("Admin"),
    adminGetTip(id),
    adminListAuthors(),
    adminListActivityOptions(),
    adminListPlaces(),
  ]);
  if (!tip) notFound();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("editTip")}</h1>
        <Link href="/admin/consigli">{t("backToList")}</Link>
      </div>
      <TipForm
        action={saveTip}
        locale={locale}
        authors={authors
          .filter((a) => a.isActive || a.id === tip.authorId)
          .map((a) => ({ id: a.id, label: a.displayName }))}
        activities={activities}
        places={places}
        values={tip}
      />
    </section>
  );
}
