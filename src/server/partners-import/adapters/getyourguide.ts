import { z } from "zod";
import { requestJson } from "@/server/http/json-request";
import { cleanText, countOf, coordsOf, currencyOf, MAX_PAGES, MAX_RESPONSE_BYTES, PAGE_SIZE, priceOf, ratingOf, REQUEST_TIMEOUT_MS } from "./common";
import type { ImportRegion, PartnerCatalogAdapter, PartnerProduct } from "../types";

// GetYourGuide, Partner API (GET /1/tours). Forma della risposta, parametri e campi
// "da verificare con la documentazione del partner prima di attivare" (docs/LANCIO.md).
// Campi sconosciuti ignorati; un tour non valido scarta solo sé stesso.

export const GYG_API_HOST = "api.getyourguide.com";
export const GYG_TOURS_PATH = "/1/tours";
export const GYG_PRODUCT_HOSTS: readonly string[] = ["www.getyourguide.com"];

const tourSchema = z.object({
  tour_id: z.union([z.string().min(1).max(100), z.number().int().nonnegative()]),
  title: z.string().min(1).max(300),
  abstract: z.string().nullish(),
  url: z.string().nullish(),
  city: z.string().nullish(),
  coordinates: z
    .object({
      latitude: z.number().nullish(),
      longitude: z.number().nullish(),
    })
    .nullish(),
  price: z
    .object({
      amount: z.number().nullish(),
      currency: z.string().nullish(),
    })
    .nullish(),
  rating: z.number().nullish(),
  review_count: z.number().nullish(),
  free_cancellation: z.boolean().nullish(),
});

// La risposta è un elenco, oppure un oggetto con "data".
const pageSchema = z.union([z.array(z.unknown()), z.object({ data: z.array(z.unknown()) })]);

// Un tour GetYourGuide normalizzato, o null se manca un campo che serve (titolo, link https).
export function toGetYourGuideProduct(raw: unknown): PartnerProduct | null {
  const parsed = tourSchema.safeParse(raw);
  if (!parsed.success) return null;
  const tour = parsed.data;
  const title = cleanText(tour.title, 200);
  const url = tour.url ?? null;
  if (title === null || url === null) return null;
  const coords = coordsOf(tour.coordinates?.latitude, tour.coordinates?.longitude);
  return {
    partnerProductId: String(tour.tour_id),
    title,
    description: cleanText(tour.abstract, 1000),
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    city: cleanText(tour.city, 80),
    priceFromEur: priceOf(tour.price?.amount),
    currency: currencyOf(tour.price?.currency),
    rating: ratingOf(tour.rating),
    reviewsCount: countOf(tour.review_count),
    freeCancellation: tour.free_cancellation ?? null,
    url,
  };
}

export type GetYourGuideOptions = { apiKey: string | null; fetchImpl?: typeof fetch };

export function createGetYourGuideAdapter(options: GetYourGuideOptions): PartnerCatalogAdapter {
  return {
    partner: "getyourguide",
    allowedHosts: GYG_PRODUCT_HOSTS,
    isConfigured: () => options.apiKey !== null,
    fetchProducts: (region) => fetchGetYourGuideProducts(options, region),
  };
}

async function* fetchGetYourGuideProducts(
  options: GetYourGuideOptions,
  region: ImportRegion,
): AsyncGenerator<PartnerProduct> {
  if (options.apiKey === null) throw new Error("getyourguide: chiave non configurata");
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`https://${GYG_API_HOST}${GYG_TOURS_PATH}`);
    url.searchParams.set("q", region.code);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(page * PAGE_SIZE));
    const body = await requestJson({
      url: url.toString(),
      method: "GET",
      allowedHosts: [GYG_API_HOST],
      headers: { "X-ACCESS-TOKEN": options.apiKey, "Accept-Language": "it-IT" },
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: MAX_RESPONSE_BYTES,
      fetchImpl: options.fetchImpl,
    });
    const parsed = pageSchema.safeParse(body);
    if (!parsed.success) throw new Error("getyourguide: risposta non valida");
    const items = Array.isArray(parsed.data) ? parsed.data : parsed.data.data;
    for (const raw of items) {
      const product = toGetYourGuideProduct(raw);
      if (product !== null) yield product;
    }
    if (items.length < PAGE_SIZE) return;
  }
  // Pagine piene fino al limite: l'elenco sarebbe incompleto e gli assenti non vanno contati come mancati.
  throw new Error("getyourguide: troppe pagine");
}
