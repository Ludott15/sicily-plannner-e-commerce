import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { FormNotice } from "@/components/admin/fields";
import { PlaceForm } from "@/components/admin/place-form";
import { AdminCoverBlock } from "@/components/admin/cover-block";
import { Link } from "@/lib/i18n/navigation";
import { getAdminMedia } from "@/server/media/admin-queries.admin";
import { savePlace } from "@/server/catalog/admin-actions.admin";
import { adminGetPlace, adminListAreas } from "@/server/catalog/admin-queries.admin";

export default async function EditPlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ salvato?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, place, areas, { salvato }] = await Promise.all([getTranslations("Admin"), adminGetPlace(id), adminListAreas(), searchParams]);
  if (!place) notFound();
  const cover = place.coverMediaId ? await getAdminMedia(place.coverMediaId) : null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{place.name}</h1>
        <div className="flex gap-4 text-body">
          <Link href="/admin/luoghi">{t("backToList")}</Link>
          <Link href={`/luoghi/${place.slug}`}>{t("viewPublic")}</Link>
        </div>
      </div>
      <FormNotice message={salvato ? t("saved") : null} />
      <PlaceForm
        action={savePlace}
        locale={locale}
        values={place}
        areas={areas.map((a) => ({ id: a.id, name: locale === "en" ? a.nameEn : a.nameIt }))}
      />
      <AdminCoverBlock cover={cover} slug={place.slug} />
    </section>
  );
}
