import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { provinceName } from "@/lib/provinces";
import { adminListPlaces } from "@/server/catalog/admin-queries.admin";

export default async function AdminPlacesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, places] = await Promise.all([getTranslations("Admin"), adminListPlaces()]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("places")}</h1>
        <ButtonLink href="/admin/luoghi/nuovo" variant="primary">
          {t("newPlace")}
        </ButtonLink>
      </div>
      {places.length === 0 ? (
        <p className="text-body-l text-lava-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col">
          {places.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-divider py-3">
              <Link href={`/admin/luoghi/${p.id}`} className="text-body font-semibold">
                {p.name}
              </Link>
              <span className="text-body-s text-lava-muted">
                {provinceName(p.province)} · {p.slug}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
