import { getTranslations, setRequestLocale } from "next-intl/server";
import { CommonsImporter } from "@/components/admin/media/commons-importer";
import { Link } from "@/lib/i18n/navigation";
import { confirmCommonsImport, previewCommonsImport } from "@/server/media/admin-actions.admin";

// Importatore Wikimedia Commons (docs/IMMAGINI.md): solo CC0, CC BY e pubblico dominio.
export default async function AdminCommonsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin");

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("commonsTitle")}</h1>
        <Link href="/admin/media" className="text-body">
          {t("backToList")}
        </Link>
      </div>
      <p className="max-w-2xl text-body text-lava-muted">{t("commonsIntro")}</p>
      <CommonsImporter preview={previewCommonsImport} confirm={confirmCommonsImport} />
    </section>
  );
}
