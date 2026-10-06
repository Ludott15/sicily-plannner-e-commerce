import { getTranslations, setRequestLocale } from "next-intl/server";
import { CommonsPhotoFinder } from "@/components/admin/media/commons-photo-finder";
import { Link } from "@/lib/i18n/navigation";
import { entitiesNeedingPhoto } from "@/server/media/admin-queries.admin";
import {
  autoAssignCommonsPhotos,
  importCommonsForEntity,
  searchCommonsForEntity,
} from "@/server/media/commons-actions.admin";

// Foto da Commons: luoghi, attività, itinerari pronti e aree che non hanno ancora una foto
// vera (nessuna immagine, immagine bloccata, solo illustrazione o segnaposto demo).
export default async function AdminCommonsPhotosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, needs] = await Promise.all([getTranslations("Admin"), entitiesNeedingPhoto()]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("photoFinderTitle")}</h1>
        <Link href="/admin/media" className="text-body">
          {t("backToList")}
        </Link>
      </div>
      <p className="max-w-3xl text-body text-lava-muted">{t("photoFinderIntro")}</p>
      <CommonsPhotoFinder
        needs={needs.map((n) => ({ type: n.type, id: n.id, name: n.name, placeName: n.placeName, current: n.current }))}
        autoAssign={autoAssignCommonsPhotos}
        search={searchCommonsForEntity}
        importPhoto={importCommonsForEntity}
      />
    </section>
  );
}
