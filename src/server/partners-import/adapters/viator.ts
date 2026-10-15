import { z } from "zod";
import { requestJson } from "@/server/http/json-request";
import { cleanText, countOf, coordsOf, currencyOf, MAX_PAGES, MAX_RESPONSE_BYTES, PAGE_SIZE, priceOf, ratingOf, REQUEST_TIMEOUT_MS } from "./common";
import type { ImportRegion, PartnerCatalogAdapter, PartnerProduct } from "../types";

// Viator, Partner API v2 (POST products/search). Forma della risposta, endpoint e campi
// "da verificare con la documentazione del partner prima di attivare" (docs/LANCIO.md).
// Campi sconosciuti ignorati; un prodotto non valido scarta solo sé stesso.

export const VIATOR_API_HOST = "api.viator.com";
export const VIATOR_SEARCH_URL = `https://${VIATOR_API_HOST}/partner/products/search`;
// Host dei link ai prodotti (diversi dall'host dell'API).
export const VIATOR_PRODUCT_HOSTS: readonly string[] = ["www.viator.com"];

const productSchema = z.object({
  productCode: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  description: z.string().nullish(),
  productUrl: z.string().nullish(),
  location: z
    .object({
      name: z.string().nullish(),
      latitude: z.number().nullish(),
      longitude: z.number().nullish(),
    })
    .nullish(),
  pricing: z
    .object({
      currency: z.string().nullish(),
      summary: z.object({ fromPrice: z.number().nullish() }).nullish(),
    })
    .nullish(),
  reviews: z
    .object({
      combinedAverageRating: z.number().nullish(),
      totalReviews: z.number().nullish(),
    })
    .nullish(),
  flags: z.array(z.string()).nullish(),
});

const pageSchema = z.object({ products: z.array(z.unknown()).default([]) });

// Un prodotto Viator normalizzato, o null se manca un campo che serve (titolo, link https).
export function toViatorProduct(raw: unknown): PartnerProduct | null {
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return null;
  const product = parsed.data;
  const title = cleanText(product.title, 200);
  const url = product.productUrl ?? null;
  if (title === null || url === null) return null;
  const coords = coordsOf(product.location?.latitude, product.location?.longitude);
  return {
    partnerProductId: product.productCode,
    title,
    description: cleanText(product.description, 1000),
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    city: cleanText(product.location?.name, 80),
    priceFromEur: priceOf(product.pricing?.summary?.fromPrice),
    currency: currencyOf(product.pricing?.currency),
    rating: ratingOf(product.reviews?.combinedAverageRating),
    reviewsCount: countOf(product.reviews?.totalReviews),
    freeCancellation: product.flags ? product.flags.includes("FREE_CANCELLATION") : null,
    url,
  };
}

export type ViatorOptions = { apiKey: string | null; fetchImpl?: typeof fetch };

export function createViatorAdapter(options: ViatorOptions): PartnerCatalogAdapter {
  return {
    partner: "viator",
    allowedHosts: VIATOR_PRODUCT_HOSTS,
    isConfigured: () => options.apiKey !== null,
    fetchProducts: (region) => fetchViatorProducts(options, region),
  };
}

async function* fetchViatorProducts(options: ViatorOptions, region: ImportRegion): AsyncGenerator<PartnerProduct> {
  // Senza chiave non si restituisce nessun prodotto: un import senza dati non deve disattivare nulla.
  if (options.apiKey === null) throw new Error("viator: chiave non configurata");
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await requestJson({
      url: VIATOR_SEARCH_URL,
      method: "POST",
      allowedHosts: [VIATOR_API_HOST],
      headers: {
        "exp-api-key": options.apiKey,
        "Accept-Language": "it-IT",
        accept: "application/json;version=2.0",
      },
      body: {
        filtering: { destination: region.code },
        currency: "EUR",
        pagination: { start: page * PAGE_SIZE + 1, count: PAGE_SIZE },
      },
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: MAX_RESPONSE_BYTES,
      fetchImpl: options.fetchImpl,
    });
    const parsed = pageSchema.safeParse(body);
    if (!parsed.success) throw new Error("viator: risposta non valida");
    for (const raw of parsed.data.products) {
      const product = toViatorProduct(raw);
      if (product !== null) yield product;
    }
    if (parsed.data.products.length < PAGE_SIZE) return;
  }
  // Pagine piene fino al limite: l'elenco sarebbe incompleto e gli assenti non vanno contati come mancati.
  throw new Error("viator: troppe pagine");
}
