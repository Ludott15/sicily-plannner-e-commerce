import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PRIMARY_NAV, SERVICE_NAV, SHOP_NAV, type NavLink } from "@/components/layout/nav-links";
import { Link } from "@/lib/i18n/navigation";
import { canonicalFor } from "@/lib/seo";

// Esplora: la pagina che la barra in basso apre su mobile. Elenca le stesse voci dell'intestazione
// (Viaggia e Servizi, come nel piè di pagina), così il mobile non perde nessuna sezione.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Nav" });
  return { title: t("explore"), alternates: canonicalFor(locale, "/esplora") };
}

export default async function ExplorePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Nav");

  const groups: { id: string; title: string; links: readonly NavLink[] }[] = [
    { id: "esplora-viaggia", title: t("travel"), links: PRIMARY_NAV },
    { id: "esplora-servizi", title: t("navServices"), links: [...SERVICE_NAV, SHOP_NAV] },
  ];

  return (
    <PageContainer width="wide" className="gap-8 md:gap-10">
      <PageHeader title={t("explore")} subtitle={t("explorePageIntro")} />
      <div className="grid gap-10 md:grid-cols-2">
        {groups.map((group) => (
          <section key={group.id} aria-labelledby={group.id}>
            <h2 id={group.id} className="is-display text-heading-2">
              {group.title}
            </h2>
            <ul className="mt-4 flex flex-col border-y border-divider">
              {group.links.map((item) => (
                <li key={item.href} className="border-b border-divider last:border-b-0">
                  <Link
                    href={item.href}
                    className="flex min-h-14 items-center justify-between gap-4 py-3 text-body font-semibold text-lava no-underline hover:underline"
                  >
                    {t(item.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
