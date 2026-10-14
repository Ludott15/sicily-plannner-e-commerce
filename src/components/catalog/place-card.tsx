import { Link } from "@/lib/i18n/navigation";
import type { CoverMedia } from "@/lib/media";
import { CoverPicture } from "./cover-picture";

// PlaceCard (docs/design/components/PlaceCard/README.md): card di un luogo nel carosello della
// home. Foto 4:5 reale, area in etichetta, nome in Fraunces, frase breve se c'è. Tutta la card
// porta alla pagina del luogo con un link esteso (is-place__link::after), come is-card.
// Server component: nessuno stato, nessun evento.

export type PlaceCardProps = {
  slug: string;
  name: string;
  areaName: string | null;
  taglineIt: string | null;
  cover: CoverMedia;
  locale: string;
};

export function PlaceCard({ slug, name, areaName, taglineIt, cover, locale }: PlaceCardProps) {
  return (
    <article className="is-place">
      <div className="is-place__media">
        {/* Decorativa: il nome del luogo, con il link, dice già di cosa si tratta. */}
        <CoverPicture cover={cover} ratio="4x5" sizes="(min-width: 768px) 28vw, 78vw" locale={locale} decorative />
      </div>
      <div className="is-place__body">
        {areaName && <p className="text-label uppercase text-lava-muted">{areaName}</p>}
        <h3 className="is-display text-heading-3 line-clamp-2">
          <Link href={`/luoghi/${slug}`} className="is-place__link">
            {name}
          </Link>
        </h3>
        {taglineIt && <p className="text-body-s text-lava-muted">{taglineIt}</p>}
      </div>
    </article>
  );
}
