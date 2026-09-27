import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ButtonAnchor } from "./button";

// AffiliateOffer (docs/design/components/AffiliateOffer/README.md)
// - Partner sempre nominato, nel bottone e nella riga di trasparenza.
// - Fatti del partner dall'API (voto e recensioni, cancellazione gratuita in success,
//   data di aggiornamento del prezzo): un fatto non disponibile si omette, non si inventa.
// - Stile secondario: stesso peso di "Aggiungi al viaggio", che resta l'azione principale.
// - Il click passa sempre da /api/go/[id] (affiliateHref).
// - Su mobile l'offerta principale compare anche nella barra fissa in basso (BookingBar).

export function affiliateHref(activityId: string) {
  return `/api/go/${activityId}`;
}

export type AffiliateOfferProps = {
  activityId: string;
  title: string;
  partner: string;
  price?: string | null;
  rating?: { value: string; count: number } | null;
  freeCancellation?: boolean;
  priceUpdated?: string | null;
};

export function AffiliateOffer({
  activityId,
  title,
  partner,
  price,
  rating,
  freeCancellation,
  priceUpdated,
}: AffiliateOfferProps) {
  const t = useTranslations("Design");
  return (
    <div className="is-offer">
      <div className="is-offer__head">
        <h3 className="is-offer__title">{title}</h3>
        {price && (
          <span className="is-offer__price">
            <small>{t("offerFrom")} </small>
            {price}
          </span>
        )}
      </div>
      <div className="is-offer__facts">
        <span>{partner}</span>
        {rating && <span>{t("offerRating", { rating: rating.value, count: rating.count })}</span>}
        {freeCancellation && <b>{t("freeCancellation")}</b>}
        {priceUpdated && <span>{t("priceUpdated", { when: priceUpdated })}</span>}
      </div>
      <ButtonAnchor variant="secondary" href={affiliateHref(activityId)} rel="sponsored nofollow">
        {t("offerCta", { partner })}
      </ButtonAnchor>
      <span className="is-offer__disclose">{t("offerDisclose", { partner })}</span>
    </div>
  );
}

// Barra fissa della scheda attività su mobile: "Aggiungi al viaggio" (principale)
// e l'offerta affiliata principale ("Con guida da 35 €"). Sostituisce la TabBar.
export function BookingBar({ addToTrip, offer }: { addToTrip: ReactNode; offer?: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-divider bg-calce-raised px-4 pt-2 pb-[max(env(safe-area-inset-bottom),8px)] md:hidden">
      <div className="flex-1 [&>*]:w-full">{addToTrip}</div>
      {offer && <div className="flex-1 [&>*]:w-full">{offer}</div>}
    </div>
  );
}
