import { getTranslations, setRequestLocale } from "next-intl/server";
import { TipForm } from "@/components/admin/tip-forms";
import { Link } from "@/lib/i18n/navigation";
import { adminListPlaces } from "@/server/catalog/admin-queries.admin";
import { saveTip } from "@/server/catalog/admin-tips-actions.admin";
import { adminListActivityOptions, adminListAuthors } from "@/server/catalog/admin-tips-queries.admin";

export default async function NewTipPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, authors, activities, places] = await Promise.all([
    getTranslations("Admin"),
    adminListAuthors(),
    adminListActivityOptions(),
    adminListPlaces(),
  ]);
  const active = authors.filter((a) => a.isActive);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("newTip")}</h1>
        <Link href="/admin/consigli">{t("backToList")}</Link>
      </div>
      {active.length === 0 ? (
        <p className="text-body">
          {t("tipNoAuthors")} <Link href="/admin/consigli/autori">{t("tipAuthors")}</Link>
        </p>
      ) : (
        <TipForm
          action={saveTip}
          locale={locale}
          authors={active.map((a) => ({ id: a.id, label: a.displayName }))}
          activities={activities}
          places={places}
          values={{
            authorId: active[0]!.id,
            activityId: null,
            placeId: null,
            body: "",
            authorRelation: null,
            verifiedAt: new Date().toISOString().slice(0, 10),
            isActive: true,
          }}
        />
      )}
    </section>
  );
}
