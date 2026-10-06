import { useTranslations } from "next-intl";
import { ActivityCard, interestDomain } from "@/components/design";
import { formatDuration, formatEur } from "@/lib/format";
import { CoverPicture } from "./cover-picture";
import type { CatalogActivity } from "@/server/catalog/queries";

// Un'attività del catalogo come ActivityCard (ActivityCard/README.md):
// - etichetta: l'interesse con la forza maggiore;
// - metadati: durata · auto necessaria · prezzo in loco, al massimo tre;
// - prezzo in evidenza solo se l'attività ha offerte dei partner: "da" la più economica;
// - Salva e "Aggiungi" non ci sono finché non esistono (builder, milestone 5): nelle liste e
//   nelle schede resta solo l'azione principale della pagina, in sospeso.
// - "Per te" solo con una personalizzazione reale (prop why, dal profilo dell'utente).
export function CatalogActivityCard({
  activity,
  locale,
  interestLabels,
}: {
  activity: CatalogActivity;
  locale: string;
  interestLabels: Map<string, string>;
}) {
  const t = useTranslations("Catalog");
  const tDesign = useTranslations("Design");
  const price = formatEur(activity.onSitePriceEur, locale);
  const offerPrice = formatEur(activity.offerPriceFromEur, locale);
  const topTag = activity.tags[0];

  const meta = [
    formatDuration(activity.durationMin),
    activity.requiresCar ? t("carNeeded") : null,
    price !== null ? (Number(activity.onSitePriceEur) === 0 ? t("freeMeta") : t("priceMeta", { price })) : null,
  ].filter((m): m is string => m !== null);

  return (
    <ActivityCard
      href={`/attivita/${activity.slug}`}
      title={activity.title}
      placeName={activity.placeName}
      image={
        activity.cover ? (
          <CoverPicture
            cover={activity.cover.media}
            ratio="4x5"
            sizes="(min-width: 1024px) 352px, (min-width: 640px) 50vw, 100vw"
            locale={locale}
            decorative
          />
        ) : undefined
      }
      tag={topTag ? { label: interestLabels.get(topTag.key) ?? topTag.key, domain: interestDomain(topTag.key) } : undefined}
      meta={meta}
      price={offerPrice !== null ? { prefix: tDesign("offerFrom"), amount: offerPrice } : null}
    />
  );
}
