import { checkUrl } from "@/server/media/safe-fetch";
import { importSlug, chooseCandidate, nearestPlace, type ActivityRef, type PlaceRef } from "./matching";
import { planMissedUpdates, type MissedUpdate } from "./missed";
import type { PartnerName, PartnerProduct } from "./types";

// Piano di un import (codice puro, senza database): dato lo stato letto in batch e i prodotti
// del partner, decide cosa creare, aggiornare, disattivare. La scrittura è in run.admin.ts.

// Durata provvisoria di un'attività creata dall'import: il partner non la dà; la verifica
// l'admin (needs_review = true).
export const NEW_ACTIVITY_DURATION_MIN = 120;

export type ExistingOffer = {
  id: string;
  partnerProductId: string;
  activityId: string;
  missedImports: number;
  isActive: boolean;
};

export type PlanInput = {
  partner: PartnerName;
  allowedHosts: readonly string[];
  products: readonly PartnerProduct[];
  // Luoghi attivi (una nuova attività va solo in un luogo attivo).
  places: readonly PlaceRef[];
  // Tutte le attività candidate al collegamento.
  activities: readonly ActivityRef[];
  // Slug già usati nel database: un'attività nuova non ne riusa nessuno.
  takenSlugs: ReadonlySet<string>;
  // Offerte già presenti per questo partner.
  existingOffers: readonly ExistingOffer[];
  newId: () => string;
};

export type OfferWrite = {
  activityId: string;
  partnerProductId: string;
  title: string;
  priceFromEur: number | null;
  currency: string;
  affiliateUrl: string;
  rating: number | null;
  reviewsCount: number | null;
  freeCancellation: boolean | null;
};

export type NewActivity = { id: string; slug: string; placeId: string; title: string };

export type TagTarget = { activityId: string; product: PartnerProduct; placeName: string };

export type ImportPlan = {
  newActivities: NewActivity[];
  offers: OfferWrite[];
  missedUpdates: MissedUpdate[];
  tagTargets: TagTarget[];
  counts: { createdCount: number; updatedCount: number; deactivatedCount: number; skippedCount: number };
};

// URL del prodotto: https e host in allowedHosts, altrimenti null (il prodotto si scarta).
export function productUrl(url: string, allowedHosts: readonly string[]): string | null {
  try {
    return checkUrl(url, allowedHosts).toString();
  } catch {
    return null;
  }
}

export function planImport(input: PlanInput): ImportPlan {
  const existingByProduct = new Map(input.existingOffers.map((offer) => [offer.partnerProductId, offer] as const));
  const activities: ActivityRef[] = [...input.activities];
  const takenSlugs = new Set(input.takenSlugs);
  const seen = new Set<string>();
  const newActivities: NewActivity[] = [];
  const offers: OfferWrite[] = [];
  const tagTargets: TagTarget[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const product of input.products) {
    if (seen.has(product.partnerProductId)) continue;
    seen.add(product.partnerProductId);

    const affiliateUrl = productUrl(product.url, input.allowedHosts);
    if (affiliateUrl === null) {
      skippedCount += 1;
      continue;
    }

    const existing = existingByProduct.get(product.partnerProductId);
    let activityId: string;
    if (existing) {
      activityId = existing.activityId;
      updatedCount += 1;
    } else {
      const candidate = chooseCandidate(product, activities);
      if (candidate) {
        activityId = candidate.activityId;
      } else {
        const place = nearestPlace(product, input.places);
        const slug = importSlug(input.partner, product.partnerProductId);
        if (place === null || slug === null || takenSlugs.has(slug)) {
          skippedCount += 1;
          continue;
        }
        takenSlugs.add(slug);
        const id = input.newId();
        newActivities.push({ id, slug, placeId: place.id, title: product.title });
        // Un prodotto successivo dello stesso import può collegarsi a questa attività appena creata.
        activities.push({ id, title: product.title, placeId: place.id, placeName: place.name, lat: place.lat, lng: place.lng });
        tagTargets.push({ activityId: id, product, placeName: place.name });
        activityId = id;
      }
      createdCount += 1;
    }

    offers.push({
      activityId,
      partnerProductId: product.partnerProductId,
      title: product.title,
      priceFromEur: product.priceFromEur,
      currency: product.currency,
      affiliateUrl,
      rating: product.rating,
      reviewsCount: product.reviewsCount,
      freeCancellation: product.freeCancellation,
    });
  }

  // I prodotti visti (anche quelli scartati) non contano come mancati: il partner li ha restituiti.
  const missedUpdates = planMissedUpdates(
    input.existingOffers.map((offer) => ({
      id: offer.id,
      partnerProductId: offer.partnerProductId,
      missedImports: offer.missedImports,
      isActive: offer.isActive,
    })),
    seen,
  );

  return {
    newActivities,
    offers,
    missedUpdates,
    tagTargets,
    counts: {
      createdCount,
      updatedCount,
      deactivatedCount: missedUpdates.filter((update) => !update.isActive).length,
      skippedCount,
    },
  };
}
