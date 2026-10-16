import { describe, expect, it } from "vitest";
import { planImport, type PlanInput } from "./plan";
import type { PartnerProduct } from "./types";

const product = (partial: Partial<PartnerProduct> & { partnerProductId: string; url: string }): PartnerProduct => ({
  title: "Prodotto",
  description: null,
  lat: null,
  lng: null,
  city: null,
  priceFromEur: 10,
  currency: "EUR",
  rating: 4.5,
  reviewsCount: 10,
  freeCancellation: true,
  ...partial,
});

const base: PlanInput = {
  partner: "viator",
  allowedHosts: ["www.viator.com"],
  products: [],
  places: [{ id: "pl-cat", name: "Catania", lat: 37.5, lng: 15.09 }],
  activities: [
    { id: "act-1", title: "Escursione Etna al tramonto", placeId: "pl-cat", placeName: "Catania", lat: 37.5, lng: 15.09 },
  ],
  takenSlugs: new Set(),
  existingOffers: [
    { id: "off-ex", partnerProductId: "EX", activityId: "act-2", missedImports: 0, isActive: true },
    { id: "off-old", partnerProductId: "OLD", activityId: "act-1", missedImports: 2, isActive: true },
  ],
  newId: () => "new-1",
};

describe("planImport", () => {
  const products: PartnerProduct[] = [
    // Collegato all'attività esistente per nome e distanza.
    product({ partnerProductId: "A", title: "Etna al tramonto escursione in jeep", lat: 37.5, lng: 15.09, url: "https://www.viator.com/a" }),
    // Nessuna candidata: nuova attività nel luogo più vicino.
    product({ partnerProductId: "B", title: "Corso di ceramica", lat: 37.5, lng: 15.09, url: "https://www.viator.com/b" }),
    // Fuori zona.
    product({ partnerProductId: "C", title: "Tour lontano", lat: 45, lng: 9, url: "https://www.viator.com/c" }),
    // Host non ammesso: scartato.
    product({ partnerProductId: "D", title: "Degustazione", lat: 37.5, lng: 15.09, url: "https://evil.example.com/d" }),
    // Già presente: aggiornato e tenuto sull'attività di prima.
    product({ partnerProductId: "EX", title: "Tour aggiornato", lat: 37.5, lng: 15.09, url: "https://www.viator.com/ex" }),
    // Duplicato di A: ignorato.
    product({ partnerProductId: "A", title: "Etna al tramonto escursione in jeep", lat: 37.5, lng: 15.09, url: "https://www.viator.com/a" }),
  ];

  it("crea, aggiorna, scarta e conta", () => {
    const plan = planImport({ ...base, products });
    expect(plan.counts).toEqual({ createdCount: 2, updatedCount: 1, deactivatedCount: 1, skippedCount: 2 });
    const byProduct = new Map(plan.offers.map((offer) => [offer.partnerProductId, offer]));
    expect(byProduct.get("A")?.activityId).toBe("act-1");
    expect(byProduct.get("B")?.activityId).toBe("new-1");
    expect(byProduct.get("EX")?.activityId).toBe("act-2");
    expect(byProduct.has("C")).toBe(false);
    expect(byProduct.has("D")).toBe(false);
  });

  it("crea l'attività nuova con slug imp-<partner>-<id> e la marca per la verifica", () => {
    const plan = planImport({ ...base, products });
    expect(plan.newActivities).toEqual([{ id: "new-1", slug: "imp-viator-b", placeId: "pl-cat", title: "Corso di ceramica" }]);
    expect(plan.tagTargets.map((target) => target.activityId)).toEqual(["new-1"]);
  });

  it("salta un'attività nuova se lo slug è già usato", () => {
    const plan = planImport({ ...base, products, takenSlugs: new Set(["imp-viator-b"]) });
    expect(plan.newActivities).toEqual([]);
    expect(plan.counts.skippedCount).toBe(3);
  });

  it("disattiva le offerte mancate per la terza volta", () => {
    const plan = planImport({ ...base, products });
    expect(plan.missedUpdates).toEqual([{ id: "off-old", missedImports: 3, isActive: false }]);
    expect(plan.counts.deactivatedCount).toBe(1);
  });

  it("un prodotto visto anche se scartato non conta come mancato", () => {
    const plan = planImport({ ...base, products: [product({ partnerProductId: "OLD", lat: 45, lng: 9, url: "https://www.viator.com/o" })] });
    expect(plan.missedUpdates.map((update) => update.id)).toEqual(["off-ex"]);
  });

  it("un nuovo prodotto può collegarsi a un'attività creata nello stesso import", () => {
    const twin = [
      product({ partnerProductId: "N1", title: "Corso di ceramica siciliana", lat: 37.5, lng: 15.09, url: "https://www.viator.com/n1" }),
      product({ partnerProductId: "N2", title: "Corso di ceramica siciliana", lat: 37.5, lng: 15.09, url: "https://www.viator.com/n2" }),
    ];
    let next = 0;
    const plan = planImport({ ...base, products: twin, newId: () => `id-${next++}` });
    expect(plan.newActivities).toHaveLength(1);
    expect(plan.offers.map((offer) => offer.activityId)).toEqual(["id-0", "id-0"]);
  });
});
