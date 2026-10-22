import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { POPULAR_ROUTES } from "@/lib/flights/routes";
import { routing } from "@/lib/i18n/routing";
import { isLegalReady } from "@/lib/legal-entity";
import { isSitemapType, SITEMAP_TYPES, type SitemapType } from "@/lib/sitemap-types";
import { listAreaSlugs } from "@/server/catalog/area-queries";
import { listPublicSlugs } from "@/server/catalog/queries";
import { listGuideSlugs } from "@/server/editorial/queries";
import { listProducerSlugs, listProductSlugs } from "@/server/shop/queries";
import { mapLimited, MAX_CONCURRENT_REQUESTS, routeHasPrices } from "@/server/flights/search";

// Letta dal database a ogni richiesta: contiene solo contenuti pubblici (dbPublic).
export const dynamic = "force-dynamic";

// Indice su /sitemap.xml e una sitemap per tipo su /sitemap/<tipo>.xml (generateSitemaps).
export async function generateSitemaps() {
  return SITEMAP_TYPES.map((id) => ({ id }));
}

const LEGAL_PATHS = [
  "/chi-siamo",
  "/privacy",
  "/cookie",
  "/condizioni-di-vendita",
  "/termini",
  "/punti/regolamento",
];

// Percorsi di un tipo, senza lingua. Ogni percorso entra in tutte le lingue (con hreflang).
async function pathsFor(type: SitemapType): Promise<string[]> {
  switch (type) {
    case "pagine": {
      // Le verticali dei servizi (alloggi, noleggi, traghetti, ...) e l'hub /servizi sono pagine pubbliche.
      return [
        "",
        "/attivita",
        "/itinerari",
        "/voli",
        "/guide",
        "/affiliazioni",
        "/servizi",
        "/dove-dormire",
        "/noleggio-auto",
        "/traghetti",
        "/treni-e-bus",
        "/transfer",
        "/musei-e-biglietti",
        "/barche",
        "/assicurazione-viaggio",
        "/esim",
        "/deposito-bagagli",
        "/crediti-foto",
        "/accessibilita",
        "/contatti",
        // Testi legali e Chi siamo: nella sitemap (e indicizzabili) solo con i dati del titolare.
        ...(isLegalReady() ? LEGAL_PATHS : []),
      ];
    }
    case "luoghi":
      return (await listPublicSlugs()).places.map((s) => `/luoghi/${s}`);
    case "attivita":
      return (await listPublicSlugs()).activities.map((s) => `/attivita/${s}`);
    case "itinerari":
      return (await listPublicSlugs()).itineraries.map((s) => `/itinerari/${s}`);
    case "aree":
      return (await listAreaSlugs()).map((s) => `/sicilia/${s}`);
    case "guide":
      return (await listGuideSlugs()).map((s) => `/guide/${s}`);
    case "prodotti": {
      // Prodotti vendibili e produttori pubblici (nessuna pagina per il solo produttore nella lista).
      const [products, producers] = await Promise.all([listProductSlugs(), listProducerSlugs()]);
      return [...products.map((s) => `/prodotti/${s}`), ...producers.map((s) => `/produttori/${s}`)];
    }
    case "voli": {
      // Le coppie di voli entrano solo con prezzi (chiamate in cache; senza token nessuna).
      const priced = await mapLimited(POPULAR_ROUTES, MAX_CONCURRENT_REQUESTS, async (route) => ({
        slug: route.slug,
        ok: await routeHasPrices(route),
      }));
      return priced.filter((r) => r.ok).map((r) => `/voli/${r.slug}`);
    }
  }
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const type = await id;
  if (!isSitemapType(type)) return [];
  const base = publicEnv.NEXT_PUBLIC_SITE_URL;
  const paths = await pathsFor(type);

  return paths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, `${base}/${l}${path}`])),
      },
    })),
  );
}
