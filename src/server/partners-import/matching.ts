import { distanceKm } from "@/server/personalization/engine";
import { NAME_MATCH_MIN, nameSimilarity, normalizeName } from "./similarity";
import type { PartnerName } from "./types";

// Collegamento di un prodotto del partner a un'attività o a un luogo (codice puro).
// Un prodotto con coordinate si confronta per distanza; senza coordinate, per nome della città
// uguale al nome del luogo (normalizzato).

export const MATCH_RADIUS_KM = 2;
export const PLACE_RADIUS_KM = 15;
export const SLUG_MAX_LENGTH = 60;

export type PlaceRef = { id: string; name: string; lat: number; lng: number };
export type ActivityRef = { id: string; title: string; placeId: string; placeName: string; lat: number; lng: number };
export type ProductRef = { title: string; lat: number | null; lng: number | null; city: string | null };

export function normalizeCity(input: string): string {
  return normalizeName(input).join(" ");
}

function inSameArea(product: ProductRef, placeName: string, lat: number, lng: number, radiusKm: number): boolean {
  if (product.lat !== null && product.lng !== null) {
    return distanceKm({ lat: product.lat, lng: product.lng }, { lat, lng }) < radiusKm;
  }
  if (product.city === null) return false;
  const city = normalizeCity(product.city);
  return city !== "" && city === normalizeCity(placeName);
}

// Attività candidata: luogo entro MATCH_RADIUS_KM (o stessa città) e nome simile da NAME_MATCH_MIN.
// Tra più candidate vince la più simile; a parità, l'id più piccolo (risultato deterministico).
export function chooseCandidate(
  product: ProductRef,
  activities: readonly ActivityRef[],
): { activityId: string; score: number } | null {
  let best: { activityId: string; score: number } | null = null;
  for (const activity of activities) {
    if (!inSameArea(product, activity.placeName, activity.lat, activity.lng, MATCH_RADIUS_KM)) continue;
    const score = nameSimilarity(product.title, activity.title);
    if (score < NAME_MATCH_MIN) continue;
    if (best === null || score > best.score || (score === best.score && activity.id < best.activityId)) {
      best = { activityId: activity.id, score };
    }
  }
  return best;
}

// Luogo dove creare una nuova attività: il più vicino entro PLACE_RADIUS_KM; senza coordinate,
// il luogo con lo stesso nome della città. null = fuori zona.
export function nearestPlace(product: ProductRef, places: readonly PlaceRef[]): PlaceRef | null {
  if (product.lat !== null && product.lng !== null) {
    let best: PlaceRef | null = null;
    let bestKm = Infinity;
    for (const place of places) {
      const km = distanceKm({ lat: product.lat, lng: product.lng }, { lat: place.lat, lng: place.lng });
      if (km > PLACE_RADIUS_KM) continue;
      if (km < bestKm || (km === bestKm && best !== null && place.id < best.id)) {
        best = place;
        bestKm = km;
      }
    }
    return best;
  }
  if (product.city === null) return null;
  const city = normalizeCity(product.city);
  if (city === "") return null;
  const sameName = places.filter((place) => normalizeCity(place.name) === city);
  if (sameName.length === 0) return null;
  return sameName.reduce((a, b) => (b.id < a.id ? b : a));
}

// Slug di un'attività creata dall'import: imp-<partner>-<id normalizzato>. null se l'ID non ha
// caratteri utili (il prodotto si scarta).
export function importSlug(partner: PartnerName, partnerProductId: string): string | null {
  const id = partnerProductId
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
  if (id === "") return null;
  return `imp-${partner}-${id}`;
}
