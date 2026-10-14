import { getTranslations, setRequestLocale } from "next-intl/server";
import { CatalogImport } from "@/components/admin/catalog-import";
import { ButtonAnchor } from "@/components/design";
import { Link, getPathname } from "@/lib/i18n/navigation";
import { catalogImportAction } from "@/server/catalog/import-actions.admin";

// Importazione CSV del catalogo: anteprima, poi conferma. Il modello è una route che
// restituisce il file CSV, quindi è un link semplice e non un Link di next-intl.
export default async function AdminActivityImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin");
  const templateHref = getPathname({ href: "/admin/attivita/importa/modello", locale });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("importTitle")}</h1>
        <Link href="/admin/attivita" className="text-body">
          {t("importBack")}
        </Link>
      </div>
      <p className="max-w-2xl text-body text-lava-muted">{t("importIntro")}</p>
      <div>
        <ButtonAnchor href={templateHref} download="catalogo-attivita.csv" variant="secondary">
          {t("importDownloadTemplate")}
        </ButtonAnchor>
      </div>
      <CatalogImport action={catalogImportAction} />
    </section>
  );
}
