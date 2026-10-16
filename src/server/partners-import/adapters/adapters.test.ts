import { describe, expect, it } from "vitest";
import { JsonRequestError } from "@/server/http/json-request";
import getyourguideFixture from "../__fixtures__/getyourguide-tours.json";
import viatorFixture from "../__fixtures__/viator-products.json";
import type { PartnerProduct } from "../types";
import { createAdapters, IMPORT_PARTNERS, SICILIA_REGION } from "./index";
import { createGetYourGuideAdapter, GYG_API_HOST } from "./getyourguide";
import { createViatorAdapter, VIATOR_SEARCH_URL } from "./viator";

// Nessuna rete: fetch finto che risponde con JSON e registra le richieste.
type Recorded = { url: string; init: RequestInit };

function fakeFetch(respond: (url: string) => Response): { fetchImpl: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return respond(url);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

async function collect(iterable: AsyncIterable<PartnerProduct>): Promise<PartnerProduct[]> {
  const out: PartnerProduct[] = [];
  for await (const product of iterable) out.push(product);
  return out;
}

describe("createAdapters", () => {
  it("senza chiavi nessun adattatore è configurato", () => {
    expect(createAdapters({}).map((adapter) => adapter.isConfigured())).toEqual([false, false]);
  });

  it("con la chiave solo il partner corrispondente è configurato", () => {
    const adapters = createAdapters({ VIATOR_API_KEY: "  k  ", GETYOURGUIDE_API_KEY: "   " });
    expect(adapters.find((a) => a.partner === "viator")?.isConfigured()).toBe(true);
    expect(adapters.find((a) => a.partner === "getyourguide")?.isConfigured()).toBe(false);
  });

  it("IMPORT_PARTNERS elenca i partner con adattatore", () => {
    expect(IMPORT_PARTNERS).toEqual(["viator", "getyourguide"]);
  });
});

describe("viator", () => {
  it("legge il fixture, scarta titolo vuoto e link assente, ignora i campi sconosciuti", async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(viatorFixture));
    const adapter = createViatorAdapter({ apiKey: "viator-test", fetchImpl });
    const products = await collect(adapter.fetchProducts(SICILIA_REGION));

    expect(products.map((p) => p.partnerProductId)).toEqual(["5731P1", "9999X2"]);
    expect(products[0]).toMatchObject({
      title: "Escursione sull'Etna al tramonto",
      city: "Catania",
      priceFromEur: 89.5,
      currency: "EUR",
      rating: 4.8,
      reviewsCount: 1243,
      freeCancellation: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(VIATOR_SEARCH_URL);
    expect((calls[0]!.init.headers as Record<string, string>)["exp-api-key"]).toBe("viator-test");
  });

  it("errore HTTP: JsonRequestError con codice, senza corpo del fornitore", async () => {
    const { fetchImpl } = fakeFetch(() => new Response("segreto", { status: 500 }));
    const adapter = createViatorAdapter({ apiKey: "k", fetchImpl });
    const error = await collect(adapter.fetchProducts(SICILIA_REGION)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(JsonRequestError);
    expect((error as JsonRequestError).code).toBe("bad_status");
  });

  it("senza chiave non restituisce nulla: l'import deve fallire, non disattivare", async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(viatorFixture));
    const adapter = createViatorAdapter({ apiKey: null, fetchImpl });
    expect(adapter.isConfigured()).toBe(false);
    await expect(collect(adapter.fetchProducts(SICILIA_REGION))).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("pagine piene fino al limite: errore, mai un elenco parziale", async () => {
    const page = {
      products: Array.from({ length: 100 }, (_, i) => ({
        productCode: `P${i}`,
        title: "Tour",
        productUrl: "https://www.viator.com/x",
      })),
    };
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(page));
    const adapter = createViatorAdapter({ apiKey: "k", fetchImpl });
    await expect(collect(adapter.fetchProducts(SICILIA_REGION))).rejects.toThrow("troppe pagine");
    expect(calls).toHaveLength(10);
  });
});

describe("getyourguide", () => {
  it("legge il fixture e tiene i campi validi; il tour senza link è scartato", async () => {
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse(getyourguideFixture));
    const adapter = createGetYourGuideAdapter({ apiKey: "gyg-test", fetchImpl });
    const products = await collect(adapter.fetchProducts(SICILIA_REGION));

    expect(products.map((p) => p.partnerProductId)).toEqual(["4412", "AB-77"]);
    expect(products[0]).toMatchObject({
      priceFromEur: 24,
      currency: "EUR",
      rating: 4.7,
      reviewsCount: 5120,
      freeCancellation: true,
      lat: 37.2868,
      lng: 13.5906,
    });
    expect(products[1]).toMatchObject({ freeCancellation: null, reviewsCount: null, priceFromEur: 65 });
    expect(calls[0]!.url).toContain(`https://${GYG_API_HOST}/1/tours`);
    expect(calls[0]!.url).toContain("q=sicilia");
    expect((calls[0]!.init.headers as Record<string, string>)["X-ACCESS-TOKEN"]).toBe("gyg-test");
  });

  it("accetta anche una risposta come elenco semplice", async () => {
    const { fetchImpl } = fakeFetch(() => jsonResponse([getyourguideFixture.data[0]]));
    const adapter = createGetYourGuideAdapter({ apiKey: "k", fetchImpl });
    const products = await collect(adapter.fetchProducts(SICILIA_REGION));
    expect(products.map((p) => p.partnerProductId)).toEqual(["4412"]);
  });
});
