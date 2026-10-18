import { getTranslations, setRequestLocale } from "next-intl/server";
import { BadgeForm, type BadgeFormInterest } from "@/components/admin/badge-form";
import { describeCriteria, type BadgeCriteria } from "@/lib/badges";
import { adminListInterests } from "@/server/catalog/admin-queries.admin";
import { listBadgesAdmin, saveBadge } from "@/server/gamification/badges.admin";

// Badge (passo 5.2): elenco con il criterio in forma leggibile e il numero di utenti che lo hanno,
// modifica di nome, descrizione e criterio, creazione di un badge nuovo. Ogni salvataggio scrive
// admin_audit_log dal server. Nessuna cancellazione: i badge assegnati non si tolgono.

type Props = { params: Promise<{ locale: string }> };

export default async function AdminBadgePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tBadges, rows, interests] = await Promise.all([
    getTranslations("AdminBadges"),
    getTranslations("Badges"),
    listBadgesAdmin(),
    adminListInterests(),
  ]);

  const interestOptions: BadgeFormInterest[] = interests.map((interest) => ({
    key: interest.key,
    label: locale === "en" ? interest.labelEn : interest.labelIt,
  }));
  const interestLabels = new Map(interestOptions.map((interest) => [interest.key, interest.label]));

  function criterionText(criteria: BadgeCriteria): string {
    const described = describeCriteria(criteria);
    const values =
      criteria.type === "interest_activities_completed"
        ? { ...described.values, interest: interestLabels.get(criteria.interest) ?? criteria.interest }
        : described.values;
    return tBadges(`criteria.${described.key}`, values);
  }

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("title")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("intro")}</p>
      </div>

      <section aria-labelledby="badge-catalogo" className="flex flex-col gap-6">
        <h2 id="badge-catalogo" className="is-display text-heading-2">
          {t("listTitle")}
        </h2>
        {rows.length === 0 ? (
          <p className="text-body text-lava-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-10">
            {rows.map((row) => (
              <li key={row.key} data-badge={row.key} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h3 className="is-display text-heading-3">{locale === "en" ? row.nameEn : row.nameIt}</h3>
                  <p className="text-body-s text-lava-muted">
                    {criterionText(row.criteria)}
                    {" · "}
                    {t("holders", { count: row.holders })}
                  </p>
                </div>
                <BadgeForm
                  action={saveBadge}
                  interests={interestOptions}
                  values={{
                    key: row.key,
                    nameIt: row.nameIt,
                    nameEn: row.nameEn,
                    description: row.description ?? "",
                    criteriaType: row.criteria.type,
                    min: row.criteria.min,
                    province: "province" in row.criteria ? row.criteria.province : "CT",
                    interest: "interest" in row.criteria ? row.criteria.interest : "",
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="badge-nuovo" className="flex flex-col gap-4">
        <h2 id="badge-nuovo" className="is-display text-heading-2">
          {t("newTitle")}
        </h2>
        <BadgeForm action={saveBadge} interests={interestOptions} />
      </section>
    </section>
  );
}
