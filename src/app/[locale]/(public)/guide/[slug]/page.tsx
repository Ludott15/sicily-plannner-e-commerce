import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Breadcrumb } from "@/components/catalog/breadcrumb";
import { CoverFigure } from "@/components/catalog/cover-figure";
import { JsonLd } from "@/components/catalog/json-ld";
import { Markdown } from "@/components/editorial/markdown";
import { publicEnv } from "@/lib/env";
import { Link } from "@/lib/i18n/navigation";
import { isServablePath, mediaUrl, variantPath, type CoverMedia } from "@/lib/media";
import { parseMarkdown } from "@/lib/markdown";
import { canonicalFor, truncate } from "@/lib/seo";
import { article, breadcrumbList } from "@/lib/structured-data";
import { getGuide } from "@/server/editorial/queries";

// Articolo di una guida: copertina con crediti (come nelle pagine luogo), titolo, autore e data,
// corpo in Markdown a larghezza di lettura (680 px), poi i luoghi, le attività e gli itinerari
// collegati. Una guida senza traduzione inglese si legge in italiano, con una nota. Le bozze non
// arrivano: getGuide le filtra con la RLS e la pagina risponde 404.

type Props = { params: Promise<{ locale: string; slug: string }> };

const LINKED_SECTIONS = [
  { kind: "place", href: "/luoghi", title: "linkedPlaces" },
  { kind: "activity", href: "/attivita", title: "linkedActivities" },
  { kind: "itinerary", href: "/itinerari", title: "linkedItineraries" },
] as const;

// Anteprima assoluta per i dati strutturati: la stessa variante che usa la pagina.
function coverImageUrl(cover: CoverMedia | null): string | null {
  if (!cover) return null;
  const base = publicEnv.NEXT_PUBLIC_SITE_URL;
  if (cover.kind === "illustration" || cover.variantsVersion === 0) {
    return isServablePath(cover.storagePath) ? `${base}${mediaUrl(cover.storagePath)}` : null;
  }
  return `${base}${mediaUrl(variantPath(cover.id, cover.variantsVersion, "16x9", 1200, "webp"))}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const guide = await getGuide(slug, locale);
  if (!guide) return {};

  const description = truncate(guide.summary);
  return {
    title: guide.title,
    description,
    alternates: canonicalFor(locale, `/guide/${guide.slug}`),
    openGraph: { title: guide.title, description, type: "article" },
  };
}

export default async function GuidePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const guide = await getGuide(slug, locale);
  if (!guide) notFound();

  const [t, tCatalog] = await Promise.all([getTranslations("Guides"), getTranslations("Catalog")]);
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });
  const publishedOn = dateFormat.format(new Date(guide.publishedAt));
  const updatedOn = guide.updatedAt.slice(0, 10) !== guide.publishedAt.slice(0, 10) ? dateFormat.format(new Date(guide.updatedAt)) : null;
  const sections = LINKED_SECTIONS.map((section) => ({
    ...section,
    items: guide.links.filter((link) => link.kind === section.kind),
  })).filter((section) => section.items.length > 0);
  const path = `/guide/${guide.slug}`;

  return (
    <article className="mx-auto w-full max-w-[1200px] px-4 pt-4 pb-12 md:px-16 md:pt-8 md:pb-16">
      <div className="hidden md:block">
        <Breadcrumb
          items={[{ label: tCatalog("breadcrumbRoot"), href: "/" }, { label: t("title"), href: "/guide" }, { label: guide.title }]}
        />
      </div>

      {/* Senza copertina la sezione non c'è: niente riquadro vuoto che ripete il titolo. */}
      {guide.cover ? (
      <div className="-mx-4 mt-4 md:mx-0">
        <CoverFigure
          cover={{ media: guide.cover, source: "own" }}
          ratio="16x9"
          sizes="(min-width: 1200px) 1072px, (min-width: 768px) calc(100vw - 128px), 100vw"
          locale={locale}
          placeholder={guide.title}
          priority
          frameClassName="aspect-[4/3] md:aspect-[21/9] md:rounded-xl"
          captionClassName="px-4 md:px-0"
        />
      </div>
      ) : null}

      <div className="mx-auto mt-8 flex max-w-[680px] flex-col gap-10">
        <header className="flex flex-col gap-4">
          <h1 className="is-display text-heading-1 text-balance md:text-display-l">{guide.title}</h1>
          {guide.summary && <p className="text-body-l text-lava-muted">{guide.summary}</p>}
          <p className="text-body-s text-lava-muted">
            {t("byAuthor", { author: guide.author })} · {t("publishedOn", { date: publishedOn })}
            {updatedOn && <> · {t("updatedOn", { date: updatedOn })}</>}
          </p>
        </header>

        {locale === "en" && !guide.translated && (
          <p role="note" className="rounded-md bg-calce-sunk px-4 py-3 text-body">
            {t("notTranslated")}
          </p>
        )}

        <Markdown blocks={parseMarkdown(guide.body)} />

        {sections.length > 0 && (
          <section aria-labelledby="collegamenti" className="flex flex-col gap-6 border-t border-divider pt-8">
            <h2 id="collegamenti" className="is-display text-heading-2">
              {t("linksTitle")}
            </h2>
            {sections.map((section) => (
              <div key={section.kind} className="flex flex-col gap-2">
                <h3 className="text-body font-semibold">{t(section.title)}</h3>
                <ul className="flex flex-col divide-y divide-divider">
                  {section.items.map((item) => (
                    <li key={`${section.kind}-${item.slug}`} className="py-3">
                      <Link href={`${section.href}/${item.slug}`} className="text-body-l font-semibold text-lava underline-offset-4 hover:underline">
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>

      <JsonLd
        data={article({
          title: guide.title,
          summary: guide.summary,
          author: guide.author,
          publishedAt: guide.publishedAt,
          updatedAt: guide.updatedAt,
          imageUrl: coverImageUrl(guide.cover),
          path,
          locale,
        })}
      />
      <JsonLd
        data={breadcrumbList(
          [
            { name: tCatalog("breadcrumbRoot"), path: "/" },
            { name: t("title"), path: "/guide" },
            { name: guide.title, path },
          ],
          locale,
        )}
      />
    </article>
  );
}
