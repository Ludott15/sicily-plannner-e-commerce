import { useLocale, useTranslations } from "next-intl";
import { CoverPicture } from "@/components/catalog/cover-picture";
import { Link } from "@/lib/i18n/navigation";
import type { CoverMedia } from "@/lib/media";

// Copertina di un'entità nella sua scheda admin: anteprima e link alla scheda dell'immagine.
// Le copertine si assegnano dalle Immagini (nome file slug-NN.jpg, importatore Commons o
// "Usa come copertina di"), non da un campo URL.
export function AdminCoverBlock({ cover, slug }: { cover: (CoverMedia & { usable: boolean }) | null; slug: string | null }) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  return (
    <section className="flex flex-col gap-3" aria-labelledby="copertina">
      <h2 id="copertina" className="is-display text-heading-2">
        {t("mediaCover")}
      </h2>
      {cover ? (
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative aspect-[4/5] w-40 overflow-hidden rounded-md bg-calce-sunk">
            <CoverPicture cover={cover} ratio="4x5" sizes="160px" locale={locale} />
          </div>
          <div className="flex flex-col gap-1 text-body">
            <Link href={`/admin/media/${cover.id}`}>{t("mediaOpen")}</Link>
            {!cover.usable && <p className="text-body-s text-danger">{t("mediaBlocked")}</p>}
          </div>
        </div>
      ) : (
        <p className="text-body text-lava-muted">{t("mediaNoCover", { slug: slug ?? "slug" })}</p>
      )}
    </section>
  );
}
