import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import type { TemplateSummary } from "@/server/catalog/queries";
import { CoverPicture } from "./cover-picture";

// Card di un itinerario pronto (mockup Home, "Itinerari pronti"): foto 4:5, giorni e
// mezzo in etichetta, titolo, luoghi toccati. Stessi stili della ActivityCard (is-card),
// perché il design system non ha una card dedicata agli itinerari.
// Con showAreas (home) la riga sotto il titolo elenca le aree di viaggio invece dei luoghi:
// se l'itinerario non ha aree, resta l'elenco dei luoghi.
export function ItineraryCard({ itinerary, showAreas = false }: { itinerary: TemplateSummary; showAreas?: boolean }) {
  const t = useTranslations("Catalog");
  const locale = useLocale();
  const days = t("days", { count: itinerary.days });
  const firstPlace = itinerary.placeNames[0] ?? itinerary.title;
  const areaNames = locale === "en" ? itinerary.areaNamesEn : itinerary.areaNamesIt;
  const metaNames = showAreas && areaNames.length > 0 ? areaNames : itinerary.placeNames;

  return (
    <article className="is-card">
      {/* Nel mockup la foto degli itinerari è orizzontale, più bassa di quella delle attività. */}
      <div className="is-card__media aspect-[4/3]">
        {itinerary.cover ? (
          // Variante 16:9 nel riquadro 4:3: object-position tiene il punto focale.
          <CoverPicture
            cover={itinerary.cover.media}
            ratio="16x9"
            sizes="(min-width: 1024px) 352px, (min-width: 640px) 50vw, 100vw"
            locale={locale}
            decorative
          />
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
        {metaNames.length > 0 && <p className="is-card__meta">{metaNames.join(", ")}</p>}
      </div>
    </article>
  );
}
