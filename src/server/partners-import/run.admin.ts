import "server-only";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { dbAdmin } from "@/server/db/admin";
import { activities, activityOffers, places, partnerImportRuns } from "@/server/db/schema";
import { createAdapters, SICILIA_REGION } from "./adapters";
import { JsonRequestError } from "@/server/http/json-request";
import { NEW_ACTIVITY_DURATION_MIN, planImport, type ImportPlan, type TagTarget } from "./plan";
import { loadTagInterests, requestActivityTags, saveTagProposals, createAnthropicTagClient, type ProposalRow } from "./tags.admin";
import type { InterestOption, TagModelClient } from "./tags";
import type { PartnerCatalogAdapter, PartnerName, PartnerProduct, ImportRegion } from "./types";

// Import del catalogo dei partner (cron import-catalog e azione "Esegui ora" dell'admin).
// Ordine: 1) si scarica l'elenco completo dei prodotti (nessuna scrittura se fallisce);
// 2) una sola transazione breve con letture in batch e scritture a blocchi; 3) proposte di tag
// per le attività nuove, fuori dalla transazione (chiamate al modello); 4) riga di log.

export const PARTNER_TIME_LIMIT_MS = 2 * 60_000;
// Cron import-catalog: maxDuration 300 s, il tempo si divide tra i partner configurati.
export const CRON_TIME_BUDGET_MS = 240_000;
export const MAX_PRODUCTS_PER_RUN = 2_000;
export const MAX_TAG_CALLS_PER_RUN = 100;
const WRITE_CHUNK = 500;

export type RunCounts = {
  createdCount: number;
  updatedCount: number;
  deactivatedCount: number;
  skippedCount: number;
};

export type RunOutcome =
  | { status: "ok"; partner: PartnerName; counts: RunCounts; newActivities: number; tagsProposed: number }
  | { status: "failed"; partner: PartnerName; error: string }
  | { status: "unconfigured"; partner: PartnerName };

export type RunDeps = {
  adapters?: readonly PartnerCatalogAdapter[];
  // undefined: client Anthropic se ANTHROPIC_API_KEY è impostata; null: niente proposte.
  tagClient?: TagModelClient | null;
  region?: ImportRegion;
  now?: () => Date;
  timeLimitMs?: number;
  newId?: () => string;
};

type AdminTx = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];

// Errore del ciclo di import con un codice breve per il log (mai il testo del fornitore).
class RunError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RunError";
  }
}

function errorCode(error: unknown): string {
  if (error instanceof RunError || error instanceof JsonRequestError) return error.code;
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const code = cause?.code ?? (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown";
}

export async function runPartnerImport(partner: PartnerName, deps: RunDeps = {}): Promise<RunOutcome> {
  const adapter = (deps.adapters ?? createAdapters()).find((candidate) => candidate.partner === partner);
  if (!adapter || !adapter.isConfigured()) return { status: "unconfigured", partner };

  const clock = deps.now ?? (() => new Date());
  const startedAt = clock();
  const deadline = Date.now() + (deps.timeLimitMs ?? PARTNER_TIME_LIMIT_MS);
  const region = deps.region ?? SICILIA_REGION;
  const newId = deps.newId ?? randomUUID;
  const tagClient = deps.tagClient !== undefined ? deps.tagClient : defaultTagClient();

  let products: PartnerProduct[];
  try {
    products = await collectProducts(adapter, region, deadline);
    // Un elenco vuoto è più probabilmente un errore di configurazione: non si contano offerte mancate.
    if (products.length === 0) throw new RunError("empty_catalog");
  } catch (error) {
    return finishFailed(partner, startedAt, clock, errorCode(error));
  }

  let plan: ImportPlan;
  try {
    plan = await dbAdmin.transaction((tx) =>
      applyImport(tx, {
        partner,
        allowedHosts: adapter.allowedHosts,
        products,
        now: clock(),
        newId,
      }),
    );
  } catch (error) {
    return finishFailed(partner, startedAt, clock, errorCode(error));
  }

  // Il log va scritto subito dopo l'import riuscito: le proposte di tag (modello esterno, tempi
  // variabili) non devono far mancare la riga di log né bloccare il partner successivo.
  await writeRun(partner, startedAt, clock(), "ok", plan.counts, null);
  const tagsProposed = await proposeTags(plan.tagTargets, tagClient, deadline);
  return {
    status: "ok",
    partner,
    counts: plan.counts,
    newActivities: plan.newActivities.length,
    tagsProposed,
  };
}

// Esegue i partner configurati in sequenza. Il budget del cron è un tetto assoluto: ogni partner
// riceve una quota del tempo rimasto, divisa tra i partner configurati ancora da eseguire.
export async function runAllPartnerImports(deps: RunDeps = {}): Promise<RunOutcome[]> {
  const adapters = deps.adapters ?? createAdapters();
  const cronDeadline = Date.now() + CRON_TIME_BUDGET_MS;
  let configuredLeft = adapters.filter((adapter) => adapter.isConfigured()).length;
  const outcomes: RunOutcome[] = [];
  for (const adapter of adapters) {
    const configured = adapter.isConfigured();
    const share = Math.floor(Math.max(0, cronDeadline - Date.now()) / Math.max(configuredLeft, 1));
    try {
      outcomes.push(
        await runPartnerImport(adapter.partner, {
          ...deps,
          adapters,
          timeLimitMs: deps.timeLimitMs ?? Math.min(PARTNER_TIME_LIMIT_MS, share),
        }),
      );
    } catch (error) {
      outcomes.push({ status: "failed", partner: adapter.partner, error: errorCode(error) });
    }
    if (configured) configuredLeft -= 1;
  }
  return outcomes;
}

// Tutto l'elenco o niente: un elenco incompleto farebbe contare come mancate offerte ancora valide.
async function collectProducts(
  adapter: PartnerCatalogAdapter,
  region: ImportRegion,
  deadline: number,
): Promise<PartnerProduct[]> {
  const products: PartnerProduct[] = [];
  for await (const product of adapter.fetchProducts(region)) {
    if (Date.now() > deadline) throw new RunError("time_limit");
    products.push(product);
    if (products.length > MAX_PRODUCTS_PER_RUN) throw new RunError("too_many_products");
  }
  return products;
}

type ApplyInput = {
  partner: PartnerName;
  allowedHosts: readonly string[];
  products: readonly PartnerProduct[];
  now: Date;
  newId: () => string;
};

// Letture in batch (luoghi, attività, offerte del partner), piano in memoria, scritture a blocchi.
async function applyImport(tx: AdminTx, input: ApplyInput): Promise<ImportPlan> {
  const placeRows = await tx
    .select({ id: places.id, name: places.name, lat: places.lat, lng: places.lng })
    .from(places)
    .where(eq(places.isActive, true));

  const activityRows = await tx
    .select({
      id: activities.id,
      slug: activities.slug,
      title: activities.title,
      placeId: activities.placeId,
      placeName: places.name,
      lat: places.lat,
      lng: places.lng,
    })
    .from(activities)
    .innerJoin(places, eq(places.id, activities.placeId));

  const offerRows = await tx
    .select({
      id: activityOffers.id,
      partnerProductId: activityOffers.partnerProductId,
      activityId: activityOffers.activityId,
      missedImports: activityOffers.missedImports,
      isActive: activityOffers.isActive,
    })
    .from(activityOffers)
    .where(eq(activityOffers.partner, input.partner));

  const plan = planImport({
    partner: input.partner,
    allowedHosts: input.allowedHosts,
    products: input.products,
    places: placeRows,
    activities: activityRows.map((a) => ({
      id: a.id,
      title: a.title,
      placeId: a.placeId,
      placeName: a.placeName,
      lat: a.lat,
      lng: a.lng,
    })),
    takenSlugs: new Set(activityRows.map((a) => a.slug)),
    existingOffers: offerRows,
    newId: input.newId,
  });

  for (const chunk of chunked(plan.newActivities, WRITE_CHUNK)) {
    await tx.insert(activities).values(
      chunk.map((activity) => ({
        id: activity.id,
        slug: activity.slug,
        placeId: activity.placeId,
        title: activity.title,
        durationMin: NEW_ACTIVITY_DURATION_MIN,
        isActive: false,
        needsReview: true,
      })),
    );
  }

  for (const chunk of chunked(plan.offers, WRITE_CHUNK)) {
    await tx
      .insert(activityOffers)
      .values(
        chunk.map((offer) => ({
          activityId: offer.activityId,
          partner: input.partner,
          partnerProductId: offer.partnerProductId,
          title: offer.title,
          priceFromEur: offer.priceFromEur === null ? null : offer.priceFromEur.toFixed(2),
          currency: offer.currency,
          affiliateUrl: offer.affiliateUrl,
          rating: offer.rating === null ? null : offer.rating.toFixed(1),
          reviewsCount: offer.reviewsCount,
          freeCancellation: offer.freeCancellation,
          priceUpdatedAt: input.now,
          isActive: true,
          missedImports: 0,
          lastSeenAt: input.now,
        })),
      )
      .onConflictDoUpdate({
        target: [activityOffers.partner, activityOffers.partnerProductId],
        set: {
          title: sql`excluded.title`,
          priceFromEur: sql`excluded.price_from_eur`,
          currency: sql`excluded.currency`,
          affiliateUrl: sql`excluded.affiliate_url`,
          rating: sql`excluded.rating`,
          reviewsCount: sql`excluded.reviews_count`,
          freeCancellation: sql`excluded.free_cancellation`,
          priceUpdatedAt: input.now,
          isActive: true,
          missedImports: 0,
          lastSeenAt: input.now,
        },
      });
  }

  for (const chunk of chunked(plan.missedUpdates, WRITE_CHUNK)) {
    await tx.execute(sql`
      update activity_offers as o
      set missed_imports = v.missed, is_active = v.active
      from (values ${sql.join(
        chunk.map((update) => sql`(${update.id}::uuid, ${update.missedImports}::smallint, ${update.isActive}::boolean)`),
        sql`, `,
      )}) as v(id, missed, active)
      where o.id = v.id
    `);
  }

  return plan;
}

// Proposte di tag per le attività nuove: fuori dalla transazione, con il tetto per esecuzione e
// il tempo massimo del partner. Ogni errore resta qui: l'import è già riuscito e registrato.
async function proposeTags(
  targets: readonly TagTarget[],
  client: TagModelClient | null,
  deadline: number,
): Promise<number> {
  if (client === null || targets.length === 0) return 0;
  try {
    const interestOptions: InterestOption[] = await loadTagInterests();
    const rows: ProposalRow[] = [];
    let failures = 0;
    for (const target of targets.slice(0, MAX_TAG_CALLS_PER_RUN)) {
      if (Date.now() > deadline) break;
      const outcome = await requestActivityTags(
        client,
        {
          title: target.product.title,
          description: target.product.description,
          city: target.placeName,
          priceFromEur: target.product.priceFromEur,
          currency: target.product.currency,
        },
        interestOptions,
      );
      if (outcome.status === "ok") {
        for (const tag of outcome.tags) {
          rows.push({ activityId: target.activityId, interestKey: tag.interestKey, strength: tag.strength });
        }
      } else if (outcome.status === "error") {
        failures += 1;
      }
    }
    if (failures > 0) console.warn("partners-import: proposte di tag non generate", { failures });
    await saveTagProposals(rows);
    return new Set(rows.map((row) => row.activityId)).size;
  } catch (error) {
    console.error("partners-import: proposte di tag non salvate", errorCode(error));
    return 0;
  }
}

async function finishFailed(
  partner: PartnerName,
  startedAt: Date,
  clock: () => Date,
  error: string,
): Promise<RunOutcome> {
  const zero: RunCounts = { createdCount: 0, updatedCount: 0, deactivatedCount: 0, skippedCount: 0 };
  await writeRun(partner, startedAt, clock(), "failed", zero, error);
  return { status: "failed", partner, error };
}

// La riga di log non deve far fallire l'import: se la scrittura fallisce, si registra solo il codice.
async function writeRun(
  partner: PartnerName,
  startedAt: Date,
  finishedAt: Date,
  status: "ok" | "failed",
  counts: RunCounts,
  error: string | null,
): Promise<void> {
  try {
    await dbAdmin.insert(partnerImportRuns).values({
      partner,
      startedAt,
      finishedAt,
      status,
      createdCount: counts.createdCount,
      updatedCount: counts.updatedCount,
      deactivatedCount: counts.deactivatedCount,
      skippedCount: counts.skippedCount,
      error,
    });
  } catch (writeError) {
    console.error("partners-import: log non scritto", errorCode(writeError));
  }
}

function defaultTagClient(): TagModelClient | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key ? createAnthropicTagClient(key) : null;
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
