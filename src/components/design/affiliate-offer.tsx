import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ActionBar } from "./action-bar";
import { ButtonAnchor } from "./button";

// AffiliateOffer (docs/design/components/AffiliateOffer/README.md)
// - Partner sempre nominato, nel bottone e nella riga di trasparenza.
// - Fatti del partner dall'API (voto e recensioni, cancellazione gratuita in success,
//   data di aggiornamento del prezzo): un fatto non disponibile si omette, non si inventa.
// - Stile secondario: stesso peso di "Aggiungi al viaggio", che resta l'azione principale.
// - Il click passa sempre da /api/go/[id] (affiliateHref).
// - Su mobile l'offerta principale compare anche nella barra fissa in basso (BookingBar).

export function affiliateHref(
  offerId: string,
  { context = "page", locale }: { context?: "page" | "itinerary" | "chat"; locale?: string } = {},
) {
  const params = new URLSearchParams({ c: context });
  if (locale) params.set("l", locale);
  return `/api/go/${offerId}?${params}`;
}

export type AffiliateOfferProps = {
  offerId: string;
  locale?: string;
  title: string;
  partner: string;
  price?: string | null;
  rating?: { value: string; count: number } | null;
  freeCancellation?: boolean;
  priceUpdated?: string | null;
};

export function AffiliateOffer({
  offerId,
  locale,
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
      <ButtonAnchor variant="secondary" href={affiliateHref(offerId, { locale })} rel="sponsored nofollow">
        {t("offerCta", { partner })}
      </ButtonAnchor>
      <span className="is-offer__disclose">{t("offerDisclose", { partner })}</span>
    </div>
  );
}

// Barra fissa della scheda attività su mobile: l'offerta affiliata principale
// ("GetYourGuide da 35 €") e "Aggiungi al viaggio" (principale). Sostituisce la TabBar.
export function BookingBar({ addToTrip, offer }: { addToTrip: ReactNode; offer?: ReactNode }) {
  return (
    <ActionBar>
      {/* Come nel mockup AttivitaMobile: offerta a sinistra, azione principale a destra. */}
      {offer && <div className="flex-1 [&>*]:w-full">{offer}</div>}
      <div className="flex-1 [&>*]:w-full">{addToTrip}</div>
    </ActionBar>
  );
}
