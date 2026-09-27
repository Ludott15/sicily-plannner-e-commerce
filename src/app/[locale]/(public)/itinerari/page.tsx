import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { localizedAlternates } from "@/lib/seo";
import { listTemplates } from "@/server/catalog/queries";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Catalog" });
  return {
    title: t("itinerariesTitle"),
    description: t("itinerariesDescription"),
    alternates: localizedAlternates(locale, "/itinerari"),
    openGraph: { title: t("itinerariesTitle"), description: t("itinerariesDescription") },
  };
}

export default async function ItinerariesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, templates] = await Promise.all([getTranslations("Catalog"), listTemplates()]);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{t("itinerariesTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("itinerariesDescription")}</p>

      {templates.length === 0 ? (
        <p className="mt-8 text-muted-foreground">{t("noItineraries")}</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {templates.map((it) => (
            <li key={it.id} className="rounded-xl border p-4">
              <Link href={`/itinerari/${it.slug}`} className="font-medium hover:underline">
                {it.title}
              </Link>
              <p className="text-sm text-muted-foreground">{t("days", { count: it.days })}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
