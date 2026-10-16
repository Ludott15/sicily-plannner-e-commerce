import { getTranslations, setRequestLocale } from "next-intl/server";
import { GuideForm } from "@/components/admin/guide-form";
import { Link } from "@/lib/i18n/navigation";
import { listAdminMedia } from "@/server/media/admin-queries.admin";
import { saveGuide } from "@/server/editorial/admin-actions.admin";

// Nuova guida: salvata come bozza. Dopo il salvataggio si passa alla modifica, dove si scelgono
// collegamenti e pubblicazione.
export default async function NewGuidePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, media] = await Promise.all([getTranslations("Admin"), listAdminMedia("all")]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("guides.new")}</h1>
        <Link href="/admin/guide">{t("backToList")}</Link>
      </div>
      <GuideForm
        action={saveGuide}
        covers={media.map((m) => ({ id: m.id, label: m.altIt?.trim() || t("guides.untitledMedia") }))}
        values={{
          slug: "",
          titleIt: "",
          titleEn: "",
          summaryIt: "",
          summaryEn: "",
          bodyIt: "",
          bodyEn: "",
          authorName: "",
          coverMediaId: "",
        }}
      />
    </section>
  );
}
