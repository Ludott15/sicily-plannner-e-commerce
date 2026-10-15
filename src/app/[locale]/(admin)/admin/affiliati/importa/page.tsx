import { getTranslations, setRequestLocale } from "next-intl/server";
import { ConversionImport } from "@/components/admin/conversion-import";
import { ButtonAnchor, ButtonLink } from "@/components/design";
import { getPathname } from "@/lib/i18n/navigation";
import { conversionImportAction } from "@/server/affiliates/conversions-actions.admin";

// Importazione CSV delle conversioni affiliate: anteprima, poi conferma. Il modello è una route che
// restituisce il file CSV, quindi è un link semplice e non un Link di next-intl.
export default async function AdminAffiliatesImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AdminAffiliates");
  const templateHref = getPathname({ href: "/admin/affiliati/importa/modello", locale });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("import.title")}</h1>
        <ButtonLink href="/admin/affiliati" variant="ghost">
          {t("import.back")}
        </ButtonLink>
      </div>
      <p className="max-w-2xl text-body text-lava-muted">{t("import.help")}</p>
      <div>
        <ButtonAnchor href={templateHref} download="conversioni-modello.csv" variant="secondary">
          {t("import.template")}
        </ButtonAnchor>
      </div>
      <ConversionImport action={conversionImportAction} />
    </section>
  );
}
