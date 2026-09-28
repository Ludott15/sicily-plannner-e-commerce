import type { ReactNode } from "react";
import { Link } from "@/lib/i18n/navigation";
import type { Domain } from "./domains";
import { WhyLine, type Why } from "./why-line";

// ActivityCard (docs/design/components/ActivityCard/README.md)
// - Foto 4:5 reale; senza foto, segnaposto calce-sunk con il nome del luogo in Fraunces.
// - Titolo al massimo su due righe (line-clamp), mai riscritto.
// - Metadati: durata · mezzo · vincoli, massimo tre.
// - Il perché: "Per te" o "Per il gruppo" (motivo aggregato), al massimo due motivi.
// - Prezzo solo se affiliabile ("guida da", "tour da"); un biglietto pagato in loco va nei metadati.
// - Tutta la card porta alla scheda; salva (44px) e azione sono controlli separati.

export type ActivityCardProps = {
  href: string;
  title: string;
  placeName: string;
  imageUrl?: string | null;
  tag?: { label: string; domain?: Domain };
  meta: string[];
  why?: Why;
  price?: { prefix: string; amount: string } | null;
  save?: ReactNode;
  action?: ReactNode;
};

export function ActivityCard({ href, title, placeName, imageUrl, tag, meta, why, price, save, action }: ActivityCardProps) {
  if (process.env.NODE_ENV !== "production" && meta.length > 3) {
    console.warn(`ActivityCard "${title}": al massimo tre metadati, ricevuti ${meta.length}.`);
  }

  return (
    <article className="is-card">
      <div className="is-card__media">
        {imageUrl ? (
          // Le foto del catalogo arrivano da URL esterni configurati dall'admin.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="is-card__ph" aria-hidden="true">
            {placeName}
          </div>
        )}
        {tag && (
          <span className={tag.domain ? `is-tag is-tag--${tag.domain}` : "is-tag"}>
            <span className="is-tag__dot" />
            {tag.label}
          </span>
        )}
        {save}
      </div>
      <div className="is-card__body">
        <h3 className="is-card__title">
          <Link href={href} className="is-card__link">
            {title}
          </Link>
        </h3>
        <p className="is-card__meta">{meta.slice(0, 3).join(" · ")}</p>
        {why && <WhyLine why={why} />}
        {(price || action) && (
          <div className="is-card__foot">
            {price ? (
              <span className="is-price">
                {price.prefix} <strong>{price.amount}</strong>
              </span>
            ) : (
              <span />
            )}
            {action}
          </div>
        )}
      </div>
    </article>
  );
}

