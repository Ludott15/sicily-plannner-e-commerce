import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { adminListTemplates } from "@/server/catalog/admin-queries.admin";

export default async function AdminTemplatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, templates] = await Promise.all([getTranslations("Admin"), adminListTemplates()]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("templates")}</h1>
        <ButtonLink href="/admin/itinerari/nuovo" variant="primary">
          {t("newTemplate")}
        </ButtonLink>
      </div>
      {templates.length === 0 ? (
        <p className="text-body-l text-lava-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col">
          {templates.map((it) => (
            <li key={it.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-divider py-3">
              <Link href={`/admin/itinerari/${it.id}`} className="text-body font-semibold">
                {it.title}
              </Link>
              <span className="text-body-s text-lava-muted">
                {it.days} · {it.slug ? t("published") : t("draft")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
