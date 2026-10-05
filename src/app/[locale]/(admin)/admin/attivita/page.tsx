import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { adminListActivities } from "@/server/catalog/admin-queries.admin";

type Filter = "tutte" | "attive" | "da-approvare";

export default async function AdminActivitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stato?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { stato } = await searchParams;
  const filter: Filter = stato === "attive" || stato === "da-approvare" ? stato : "tutte";
  const [t, rows] = await Promise.all([getTranslations("Admin"), adminListActivities(filter)]);

  const filters: { key: Filter; label: string }[] = [
    { key: "tutte", label: t("filterAll") },
    { key: "attive", label: t("filterActive") },
    { key: "da-approvare", label: t("filterPending") },
  ];

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("activities")}</h1>
        <ButtonLink href="/admin/attivita/nuova" variant="primary">
          {t("newActivity")}
        </ButtonLink>
      </div>
      <nav className="is-days" aria-label={t("colState")}>
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key === "tutte" ? "/admin/attivita" : `/admin/attivita?stato=${f.key}`}
            className="is-day"
            aria-current={filter === f.key ? "true" : undefined}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-body-l text-lava-muted">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body">
            <thead className="text-body-s text-lava-muted">
              <tr className="border-b border-divider">
                <th className="py-2 pr-4 font-semibold">{t("colTitle")}</th>
                <th className="py-2 pr-4 font-semibold">{t("colPlace")}</th>
                <th className="py-2 pr-4 font-semibold">{t("colTags")}</th>
                <th className="py-2 pr-4 font-semibold">{t("colOffers")}</th>
                <th className="py-2 font-semibold">{t("colState")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-divider">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/attivita/${row.id}`} className="font-semibold">
                      {row.title}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">{row.placeName}</td>
                  <td className={cn("py-3 pr-4 tabular-nums", row.tags === 0 && "font-semibold text-danger")}>{row.tags}</td>
                  <td className="py-3 pr-4 tabular-nums">{row.offers}</td>
                  <td className="py-3">{row.isActive ? t("active") : t("inactive")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
