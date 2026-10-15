import "server-only";
import { getTranslations } from "next-intl/server";
import { formatDriveTime, formatDuration } from "@/lib/format";
import { interestLabels } from "@/server/catalog/labels";
import { areaNames } from "@/server/personalization/data";
import type { AreaReason, Reason } from "@/server/personalization/engine";

// Testi delle proposte (viaggi per te e viaggi per il gruppo): stessi codici del motore,
// tradotti una volta sola per pagina. La card (proposal-card.tsx) li riceve già pronti.
export async function proposalTexts(locale: string) {
  const [t, tOnboarding, labels, areas] = await Promise.all([
    getTranslations("Proposals"),
    getTranslations("Onboarding"),
    interestLabels(locale),
    areaNames(locale),
  ]);
  const label = (key: string): string => labels.get(key) ?? key;
  const nameOf = (slug: string): string => areas.get(slug) ?? slug;

  // Viaggio su due aree: "Palermo e Ovest"; su una sola area, il nome dell'area.
  const areaTitle = (slugs: [string] | [string, string]): string =>
    slugs.length === 2 ? t("pairName", { first: nameOf(slugs[0]), second: nameOf(slugs[1]) }) : nameOf(slugs[0]);

  const reasonText = (r: Reason): string => {
    switch (r.code) {
      case "combines":
        return t("reasons.combines", { a: label(r.interests[0]), b: label(r.interests[1]).toLowerCase() });
      case "topForInterest":
        return t("reasons.topForInterest", { interest: label(r.interest).toLowerCase() });
      case "strongestInterest":
        return t("reasons.strongestInterest", { interest: label(r.interest).toLowerCase() });
      case "topRated":
        return t("reasons.topRated", { rating: r.rating.toLocaleString(locale) });
      case "shortVisit":
        return t("reasons.shortVisit", { duration: formatDuration(r.minutes) });
      default:
        return t(`reasons.${r.code}`);
    }
  };

  const areaReasonTexts = (r: AreaReason): string[] => {
    switch (r.code) {
      case "interestStops":
        return r.interests.map((i) => t("areaReasons.interestStops", { count: i.stops, interest: label(i.key).toLowerCase() }));
      case "nearAirport":
        return [t("areaReasons.nearAirport", { airport: tOnboarding(`airport.${r.airport}`) })];
      case "highlyRated":
        return [t("areaReasons.highlyRated", { rating: r.rating.toLocaleString(locale) })];
      case "variant":
        return [t("areaReasons.variant", { interest: label(r.interest).toLowerCase() })];
      case "stops":
        return [t("areaReasons.stops", { stops: r.stops, days: r.days })];
      case "noCar":
        return [t("areaReasons.noCar")];
      case "twoAreas":
        return [t("areaReasons.twoAreas", { duration: formatDriveTime(r.driveMinutes) })];
    }
  };

  return { t, areaTitle, reasonText, areaReasonTexts };
}

export type ProposalTexts = Awaited<ReturnType<typeof proposalTexts>>;
