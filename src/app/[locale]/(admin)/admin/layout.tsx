import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { requireAdmin } from "@/server/auth";

// Area admin: solo per gli admin (404 per tutti gli altri), mai indicizzata.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const t = await getTranslations("Admin");

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
        <Link href="/admin/media" className="text-body font-semibold text-lava">
          {t("media")}
        </Link>
        <Link href="/admin/copertura" className="text-body font-semibold text-lava">
          {t("coverage")}
        </Link>
      </nav>
      <div className="py-8">{children}</div>
    </div>
  );
}
