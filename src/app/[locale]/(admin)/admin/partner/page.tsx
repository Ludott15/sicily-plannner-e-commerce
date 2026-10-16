import { getTranslations, setRequestLocale } from "next-intl/server";
import { PartnerForm } from "@/components/admin/partner-form";
import { listAffiliatePartners, savePartner } from "@/server/catalog/partners.admin";

// Partner affiliati (passo 3.1): elenco e modifica di ogni riga di affiliate_partners. Solo admin
// (il layout dell'area admin risponde 404 agli altri). Ogni salvataggio scrive admin_audit_log.
export default async function PartnerAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, rows] = await Promise.all([getTranslations("Admin"), listAffiliatePartners()]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("partnersTitle")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("partnersIntro")}</p>
      </div>
      <ul className="flex flex-col gap-10">
        {rows.map((row) => (
          <li key={row.partner} data-partner={row.partner} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="is-display text-heading-2">{row.name}</h2>
              <p className="text-body-s text-lava-muted">
                {row.isActive ? t("partnerActive") : t("partnerInactive")}
                {" · "}
                {row.envConfigured ? t("partnerEnvSet") : t("partnerEnvUnset")}
              </p>
            </div>
            <PartnerForm
              action={savePartner}
              locale={locale}
              values={{
                partner: row.partner,
                name: row.name,
                verticals: row.verticals,
                searchUrlTemplate: row.searchUrlTemplate,
                allowedHosts: row.allowedHosts,
                subidParam: row.subidParam,
                partnerIdEnv: row.partnerIdEnv,
                isActive: row.isActive,
                envConfigured: row.envConfigured,
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
