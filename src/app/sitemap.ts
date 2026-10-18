import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { POPULAR_ROUTES } from "@/lib/flights/routes";
import { routing } from "@/lib/i18n/routing";
import { isPending } from "@/lib/pending-actions";
import { isSitemapType, SITEMAP_TYPES, type SitemapType } from "@/lib/sitemap-types";
import { listAreaSlugs } from "@/server/catalog/area-queries";
import { listPublicSlugs } from "@/server/catalog/queries";
import { verticalAvailability } from "@/server/affiliates/verticals";
import { listGuideSlugs } from "@/server/editorial/queries";
import { mapLimited, MAX_CONCURRENT_REQUESTS, routeHasPrices } from "@/server/flights/search";

// Letta dal database a ogni richiesta: contiene solo contenuti pubblici (dbPublic).
export const dynamic = "force-dynamic";

// Indice su /sitemap.xml e una sitemap per tipo su /sitemap/<tipo>.xml (generateSitemaps).
export async function generateSitemaps() {
  return SITEMAP_TYPES.map((id) => ({ id }));
}

// Percorsi di un tipo, senza lingua. Ogni percorso entra in tutte le lingue (con hreflang).
async function pathsFor(type: SitemapType): Promise<string[]> {
  switch (type) {
    case "pagine": {
      // Alloggi e noleggi entrano solo quando il partner è pronto (ID configurato): altrimenti sono "in arrivo" e noindex.
      const [lodgingReady, carReady] = await Promise.all([
        verticalAvailability("lodging").then((s) => s === "ready"),
        verticalAvailability("car").then((s) => s === "ready"),
      ]);
      return [
        "",
        "/attivita",
        "/itinerari",
        "/voli",
        "/guide",
        "/affiliazioni",
        ...(lodgingReady ? ["/dove-dormire"] : []),
        ...(carReady ? ["/noleggio-auto"] : []),
        "/crediti-foto",
        // Pagine con testi ancora in sospeso: fuori dalla sitemap (e noindex) finché non sono scritte.
        ...(isPending("about.editorial", "about.founder") ? [] : ["/chi-siamo"]),
        ...(isPending("legal.privacy") ? [] : ["/privacy"]),
        ...(isPending("legal.cookie") ? [] : ["/cookie"]),
        ...(isPending("legal.terms") ? [] : ["/condizioni-di-vendita"]),
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
