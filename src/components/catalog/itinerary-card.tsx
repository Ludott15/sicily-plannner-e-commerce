import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import type { TemplateSummary } from "@/server/catalog/queries";

// Card di un itinerario pronto (mockup Home, "Itinerari pronti"): foto 4:5, giorni e
// mezzo in etichetta, titolo, luoghi toccati. Stessi stili della ActivityCard (is-card),
// perché il design system non ha una card dedicata agli itinerari.
export function ItineraryCard({ itinerary }: { itinerary: TemplateSummary }) {
  const t = useTranslations("Catalog");
  const days = t("days", { count: itinerary.days });
  const firstPlace = itinerary.placeNames[0] ?? itinerary.title;

  return (
    <article className="is-card">
      {/* Nel mockup la foto degli itinerari è orizzontale, più bassa di quella delle attività. */}
      <div className="is-card__media aspect-[4/3]">
        {itinerary.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={itinerary.coverImage} alt="" loading="lazy" />
        ) : (
          <div className="is-card__ph" aria-hidden="true">
            {firstPlace}
          </div>
        )}
      </div>
      <div className="is-card__body">
        <p className="text-label uppercase text-lava-muted">
          {itinerary.requiresCar ? t("templateCardDays", { days }) : days}
        </p>
        <h3 className="is-card__title is-display">
          <Link href={`/itinerari/${itinerary.slug}`} className="is-card__link">
            {itinerary.title}
          </Link>
        </h3>
        {itinerary.placeNames.length > 0 && <p className="is-card__meta">{itinerary.placeNames.join(", ")}</p>}
      </div>
    </article>
  );
}
