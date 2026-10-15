import { distanceKm } from "./geo";

// Alternative a una tappa di un viaggio di gruppo (passo 4.2). Pura: il chiamante passa il catalogo
// già filtrato alle attività attive e l'insieme delle attività già nel viaggio.

export const ALTERNATIVE_RADIUS_KM = 15;
export const MAX_ALTERNATIVES = 2;

export type AlternativeCandidate = {
  activityId: string;
  title: string;
  placeName: string;
  area: string;
  lat: number;
  lng: number;
  rating: number | null;
};

export type AlternativeStop = {
  activityId: string;
  area: string;
  lat: number;
  lng: number;
};

export type Alternative = {
  activityId: string;
  title: string;
  placeName: string;
  distanceKm: number;
};

// Stessa area o entro il raggio; attività non già nel viaggio; con `scores` (punteggio per il
// profilo del gruppo, passo 4.3) punteggio decrescente, altrimenti voto del catalogo decrescente;
// poi distanza crescente, poi id. Al massimo MAX_ALTERNATIVES.
export function nearbyAlternatives(
  stop: AlternativeStop,
  catalog: readonly AlternativeCandidate[],
  inTrip: ReadonlySet<string>,
  scores?: ReadonlyMap<string, number>,
): Alternative[] {
  const origin = { lat: stop.lat, lng: stop.lng };
  const rank = (c: AlternativeCandidate): number =>
    scores ? (scores.get(c.activityId) ?? -Infinity) : (c.rating ?? -Infinity);
  return catalog
    .filter((c) => c.activityId !== stop.activityId && !inTrip.has(c.activityId))
    .map((c) => ({ candidate: c, km: distanceKm(origin, { lat: c.lat, lng: c.lng }) }))
    .filter(({ candidate, km }) => candidate.area === stop.area || km <= ALTERNATIVE_RADIUS_KM)
    .sort(
      (a, b) =>
        rank(b.candidate) - rank(a.candidate) ||
        a.km - b.km ||
        (a.candidate.activityId < b.candidate.activityId ? -1 : a.candidate.activityId > b.candidate.activityId ? 1 : 0),
    )
    .slice(0, MAX_ALTERNATIVES)
    .map(({ candidate, km }) => ({
      activityId: candidate.activityId,
      title: candidate.title,
      placeName: candidate.placeName,
      distanceKm: Math.round(km * 10) / 10,
    }));
}
