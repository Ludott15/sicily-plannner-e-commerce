import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, like, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { activities, activityOffers, partnerImportRuns, places } from "@/server/db/schema";
import { runPartnerImport } from "./run.admin";
import type { PartnerCatalogAdapter, PartnerProduct } from "./types";

// Import dei partner su Postgres locale con un adattatore finto. Il partner è "civitatis": non ha
// un adattatore reale, così i dati del test non toccano le offerte degli altri partner.
// Tutto ha il prefisso int-; le righe create dall'import si cancellano in afterAll.

const s = Date.now();
const PARTNER = "civitatis" as const;
const id = () => randomUUID();
const placeId = id();
const existingActivityId = id();
const existingActivitySlug = `int-att-${s}`;
const newActivitySlug = `imp-civitatis-int-${s}-3`;
const productIds = { near: `int-${s}-1`, far: `int-${s}-2`, unmatched: `int-${s}-3` };
const startedAfter = new Date();

const product = (partial: Pick<PartnerProduct, "partnerProductId" | "title"> & Partial<PartnerProduct>): PartnerProduct => ({
  description: null,
  lat: null,
  lng: null,
  city: null,
  priceFromEur: 20,
  currency: "EUR",
  rating: 4.5,
  reviewsCount: 12,
  freeCancellation: true,
  url: `https://www.civitatis.com/${partial.partnerProductId}`,
  ...partial,
});

// Elenco prodotti servito dal finto adattatore; cambia tra un import e l'altro.
let current: PartnerProduct[] = [];
let failNext = false;

async function* fakeProducts(): AsyncGenerator<PartnerProduct> {
  if (failNext) throw new Error("rete non disponibile");
  for (const item of current) yield item;
}

const fakeAdapter: PartnerCatalogAdapter = {
  partner: PARTNER,
  allowedHosts: ["www.civitatis.com"],
  isConfigured: () => true,
  fetchProducts: () => fakeProducts(),
};

const run = () => runPartnerImport(PARTNER, { adapters: [fakeAdapter], tagClient: null });

async function offerOf(productId: string) {
  const [row] = await dbAdmin
    .select()
    .from(activityOffers)
    .where(and(eq(activityOffers.partner, PARTNER), eq(activityOffers.partnerProductId, productId)));
  return row;
}

async function lastRun() {
  const [row] = await dbAdmin
    .select()
    .from(partnerImportRuns)
    .where(and(eq(partnerImportRuns.partner, PARTNER), gte(partnerImportRuns.startedAt, startedAfter)))
    .orderBy(desc(partnerImportRuns.startedAt))
    .limit(1);
  return row;
}

beforeAll(async () => {
  await dbAdmin.insert(places).values({
    id: placeId,
    slug: `int-luogo-${s}`,
    name: `int- Luogo ${s}`,
    province: "CT",
    lat: 37.5,
    lng: 15.09,
    isActive: true,
  });
  await dbAdmin.insert(activities).values({
    id: existingActivityId,
    slug: existingActivitySlug,
    placeId,
    title: "int- Escursione Etna al tramonto",
    durationMin: 60,
    isActive: false,
  });
});

afterAll(async () => {
  const offers = await dbAdmin
    .select({ id: activityOffers.id })
    .from(activityOffers)
    .where(and(eq(activityOffers.partner, PARTNER), inArray(activityOffers.partnerProductId, Object.values(productIds))));
  if (offers.length > 0) await dbAdmin.delete(activityOffers).where(inArray(activityOffers.id, offers.map((o) => o.id)));
  // Tutte le attività create dall'import di questa esecuzione (slug imp-civitatis-int-<s>-…).
  await dbAdmin
    .delete(activities)
    .where(or(eq(activities.slug, existingActivitySlug), like(activities.slug, `imp-civitatis-int-${s}-%`)));
  await dbAdmin.delete(places).where(eq(places.id, placeId));
  await dbAdmin
    .delete(partnerImportRuns)
    .where(and(eq(partnerImportRuns.partner, PARTNER), gte(partnerImportRuns.startedAt, startedAfter)));
});

describe("import dei partner", () => {
  it("primo import: collega il prodotto vicino, crea un'attività inattiva da verificare, scarta il lontano, scrive il log", async () => {
    current = [
      product({ partnerProductId: productIds.near, title: "int- Etna al tramonto escursione in jeep", lat: 37.5005, lng: 15.0905 }),
      product({ partnerProductId: productIds.far, title: "int- Degustazione vini sul mare", lat: 45, lng: 9 }),
      product({ partnerProductId: productIds.unmatched, title: "int- Tour del centro storico", lat: 37.5002, lng: 15.0908 }),
    ];
    const outcome = await run();
    expect(outcome).toMatchObject({ status: "ok", counts: { createdCount: 2, updatedCount: 0, deactivatedCount: 0, skippedCount: 1 } });

    const near = await offerOf(productIds.near);
    expect(near).toMatchObject({ activityId: existingActivityId, isActive: true, missedImports: 0 });

    const [created] = await dbAdmin.select().from(activities).where(eq(activities.slug, newActivitySlug));
    expect(created).toMatchObject({ isActive: false, needsReview: true, description: null });
    expect((await offerOf(productIds.unmatched))?.activityId).toBe(created?.id);
    expect(await offerOf(productIds.far)).toBeUndefined();

    expect(await lastRun()).toMatchObject({ status: "ok", createdCount: 2, skippedCount: 1, error: null });
  });

  it("tre import senza il prodotto: al terzo mancato l'offerta si disattiva", async () => {
    current = [product({ partnerProductId: productIds.near, title: "int- Etna al tramonto escursione in jeep", lat: 37.5005, lng: 15.0905 })];

    await run();
    expect((await offerOf(productIds.unmatched))?.missedImports).toBe(1);
    await run();
    expect((await offerOf(productIds.unmatched))?.missedImports).toBe(2);
    expect((await offerOf(productIds.unmatched))?.isActive).toBe(true);

    await run();
    const missing = await offerOf(productIds.unmatched);
    expect(missing).toMatchObject({ missedImports: 3, isActive: false });
    expect(await lastRun()).toMatchObject({ status: "ok", deactivatedCount: expect.any(Number) });
    expect((await offerOf(productIds.near))?.missedImports).toBe(0);
  });

  it("un import fallito non incrementa missed_imports e lo registra", async () => {
    failNext = true;
    const before = await offerOf(productIds.near);
    const outcome = await run();
    failNext = false;

    expect(outcome.status).toBe("failed");
    expect(await offerOf(productIds.near)).toMatchObject({ missedImports: before?.missedImports, isActive: true });
    expect(await lastRun()).toMatchObject({ status: "failed", createdCount: 0, deactivatedCount: 0 });
  });
});
