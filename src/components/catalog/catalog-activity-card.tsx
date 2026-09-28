import { useTranslations } from "next-intl";
import { ActivityCard, interestDomain, PendingButton, PendingSaveButton } from "@/components/design";
import { formatDuration, formatEur } from "@/lib/format";
import type { CatalogActivity } from "@/server/catalog/queries";

// Un'attività del catalogo come ActivityCard (ActivityCard/README.md):
// - etichetta: l'interesse con la forza maggiore;
// - metadati: durata · auto necessaria · prezzo in loco, al massimo tre;
// - nessun prezzo in evidenza: è solo per le offerte affiliate, che arrivano con lo schema 2e;
// - salva e "Aggiungi" arrivano con il builder (milestone 5): per ora in sospeso.
// Nessun "Per te": la personalizzazione arriva con la milestone 4.
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
  const price = formatEur(activity.priceFromEur, locale);
  const topTag = activity.tags[0];

  const meta = [
    formatDuration(activity.durationMin),
    activity.requiresCar ? t("carNeeded") : null,
    price !== null ? (Number(activity.priceFromEur) === 0 ? t("freeMeta") : t("priceMeta", { price })) : null,
  ].filter((m): m is string => m !== null);

  return (
    <ActivityCard
      href={`/attivita/${activity.slug}`}
      title={activity.title}
      placeName={activity.placeName}
      imageUrl={activity.placeCoverImage}
      tag={topTag ? { label: interestLabels.get(topTag.key) ?? topTag.key, domain: interestDomain(topTag.key) } : undefined}
      meta={meta}
      save={<PendingSaveButton title={activity.title} />}
      action={
        <PendingButton id="card.add" variant="secondary" size="sm">
          {tDesign("add")}
        </PendingButton>
      }
    />
  );
}
