import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { requireAdmin } from "@/server/auth";
import { adminImportAlertPartners } from "@/server/partners-import/admin.admin";

// Area admin: solo per gli admin (404 per tutti gli altri), mai indicizzata.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const t = await getTranslations("Admin");
  const tAffiliates = await getTranslations("AdminAffiliates");
  const tDriveTimes = await getTranslations("AdminDriveTimes");
  const tReviews = await getTranslations("AdminReviews");
  const tBadges = await getTranslations("AdminBadges");
  const tSeasons = await getTranslations("AdminSeasons");
  const tAi = await getTranslations("Admin.ai");
  // Banner sopra ogni pagina dell'area admin (anche la home, che reindirizza all'elenco attività):
  // avviso se un partner configurato ha due esecuzioni di fila fallite.
  const alertPartners = await adminImportAlertPartners();

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-16">
      <nav aria-label={t("nav")} className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-divider pb-4">
        <span className="text-label uppercase text-lava-muted">{t("title")}</span>
        <Link href="/admin/attivita" className="text-body font-semibold text-lava">
          {t("activities")}
        </Link>
        <Link href="/admin/luoghi" className="text-body font-semibold text-lava">
          {t("places")}
        </Link>
        <Link href="/admin/itinerari" className="text-body font-semibold text-lava">
          {t("templates")}
        </Link>
        <Link href="/admin/consigli" className="text-body font-semibold text-lava">
          {t("tips")}
        </Link>
        <Link href="/admin/guide" className="text-body font-semibold text-lava">
          {t("guides.nav")}
        </Link>
        <Link href="/admin/aree" className="text-body font-semibold text-lava">
          {t("areas.nav")}
        </Link>
        <Link href="/admin/media" className="text-body font-semibold text-lava">
          {t("media")}
        </Link>
        <Link href="/admin/contenuti" className="text-body font-semibold text-lava">
          {t("content")}
        </Link>
        <Link href="/admin/copertura" className="text-body font-semibold text-lava">
          {t("coverage")}
        </Link>
        <Link href="/admin/partner" className="text-body font-semibold text-lava">
          {t("partners")}
        </Link>
        <Link href="/admin/import-partner" className="text-body font-semibold text-lava">
          {t("importPartner")}
        </Link>
        <Link href="/admin/affiliati" className="text-body font-semibold text-lava">
          {tAffiliates("nav")}
        </Link>
        <Link href="/admin/tempi-di-guida" className="text-body font-semibold text-lava">
          {tDriveTimes("nav")}
        </Link>
        <Link href="/admin/recensioni" className="text-body font-semibold text-lava">
          {tReviews("nav")}
        </Link>
        <Link href="/admin/badge" className="text-body font-semibold text-lava">
          {tBadges("nav")}
        </Link>
        <Link href="/admin/stagioni" className="text-body font-semibold text-lava">
          {tSeasons("nav")}
        </Link>
        <Link href="/admin/ai" className="text-body font-semibold text-lava">
          {tAi("nav")}
        </Link>
      </nav>
      {alertPartners.length > 0 && (
        <div className="mt-6 flex flex-col gap-1 rounded-sm border-[1.5px] border-danger bg-calce-raised px-4 py-3 text-body">
          <p className="font-semibold text-danger">{t("importAlertTitle")}</p>
          <p>
            {t("importAlertBody", { partners: alertPartners.map((partner) => t(`importPartnerName.${partner}`)).join(", ") })}
          </p>
          <Link href="/admin/import-partner" className="font-semibold">
            {t("importAlertLink")}
          </Link>
        </div>
      )}
      <div className="py-8">{children}</div>
    </div>
  );
}
