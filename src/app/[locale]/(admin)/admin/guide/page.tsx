import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { listAllGuides } from "@/server/editorial/admin-queries.admin";

// Elenco delle guide, anche le bozze. Da qui si crea una guida nuova o si modifica una esistente.
export default async function AdminGuidesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, guides] = await Promise.all([getTranslations("Admin"), listAllGuides()]);
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("guides.title")}</h1>
        <ButtonLink href="/admin/guide/nuova" variant="primary">
          {t("guides.new")}
        </ButtonLink>
      </div>
      {guides.length === 0 ? (
        <p className="text-body-l text-lava-muted">{t("guides.empty")}</p>
      ) : (
        <ul className="flex flex-col">
          {guides.map((guide) => (
            <li key={guide.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-divider py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`/admin/guide/${guide.id}`} className="text-body font-semibold">
                  {guide.title}
                </Link>
                <span className="text-body-s font-semibold">
                  {guide.status === "published" ? t("guides.statusPublished") : t("guides.statusDraft")}
                </span>
              </div>
              <span className="text-body-s text-lava-muted">
                {guide.author} · {guide.slug}
                {guide.status === "published" && guide.publishedAt
                  ? ` · ${dateFormat.format(new Date(guide.publishedAt))}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
