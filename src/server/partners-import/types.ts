import type { partner } from "@/server/db/schema";

// Partner dell'enum del database (anche quelli senza adattatore, come nei test).
export type PartnerName = (typeof partner.enumValues)[number];

// Area di ricerca passata agli adattatori. Il codice del partner è la destinazione o la
// località da cercare presso il fornitore: gli ID di destinazione reali si verificano prima
// dell'attivazione (docs/LANCIO.md).
export type ImportRegion = { code: string };

// Prodotto normalizzato, indipendente dal partner. Nessun campo del partner esce dal modulo
// degli adattatori senza passare da qui.
export type PartnerProduct = {
  partnerProductId: string;
  title: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  priceFromEur: number | null;
  currency: string;
  rating: number | null;
  reviewsCount: number | null;
  freeCancellation: boolean | null;
  // Link al prodotto sul sito del partner: https e host in allowedHosts.
  url: string;
};

export interface PartnerCatalogAdapter {
  readonly partner: PartnerName;
  // Host esatti ammessi per l'URL del prodotto (non per le chiamate API).
  readonly allowedHosts: readonly string[];
  isConfigured(): boolean;
  fetchProducts(region: ImportRegion): AsyncIterable<PartnerProduct>;
}

// Risposta uniforme delle azioni server (regola dell'architettura: ActionResponse).
export type ActionResponse<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };
