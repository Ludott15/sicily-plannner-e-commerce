import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CoverPicture } from "@/components/catalog/cover-picture";
import { JsonLd } from "@/components/catalog/json-ld";
import { ButtonLink } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Link } from "@/lib/i18n/navigation";
import { canonicalFor } from "@/lib/seo";
import { breadcrumbList } from "@/lib/structured-data";
import { listGuides } from "@/server/editorial/queries";

// Elenco delle guide della redazione (solo le pubblicate: lo decide la RLS). Stato vuoto con
// un'azione, come nel manuale: una frase che dice cosa fare. Le card riprendono la card dell'itinerario
// (is-card), con la copertina e i crediti sotto la foto solo nell'articolo.

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Guides" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: canonicalFor(locale, "/guide"),
    openGraph: { title: t("title"), description: t("description") },
  };
}

export default async function GuidesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tCatalog, guides] = await Promise.all([
    getTranslations("Guides"),
    getTranslations("Catalog"),
    listGuides(locale),
  ]);
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });

  return (
    <PageContainer width="wide" className="gap-8 md:gap-10">
      <PageHeader title={t("title")} subtitle={t("description")} />

      {guides.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-body-l">{t("empty")}</p>
          <ButtonLink href="/attivita" variant="primary">
            {tCatalog("exploreActivities")}
          </ButtonLink>
        </div>
      ) : (
        <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((guide) => (
            <li key={guide.slug}>
              <article className="is-card">
                <div className="is-card__media">
                  {guide.cover ? (
                    <CoverPicture
                      cover={guide.cover}
                      ratio="4x5"
                      sizes="(min-width: 1024px) 352px, (min-width: 640px) 50vw, 100vw"
                      locale={locale}
                      decorative
                    />
                  ) : (
                    <span className="is-card__ph" aria-hidden="true">
                      {guide.title}
                    </span>
                  )}
                </div>
                <div className="is-card__body">
                  <h2 className="is-card__title">
                    <Link href={`/guide/${guide.slug}`} className="is-card__link">
                      {guide.title}
                    </Link>
                  </h2>
                  {guide.summary && <p className="text-body text-lava-muted">{guide.summary}</p>}
                  <p className="is-card__meta">
                    {t("byAuthor", { author: guide.author })} · {dateFormat.format(new Date(guide.publishedAt))}
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      <JsonLd
        data={breadcrumbList(
          [
            { name: tCatalog("breadcrumbRoot"), path: "/" },
            { name: t("title"), path: "/guide" },
          ],
          locale,
        )}
      />
    </PageContainer>
  );
}
