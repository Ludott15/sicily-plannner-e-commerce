import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { POPULAR_ROUTES } from "@/lib/flights/routes";
import { routing } from "@/lib/i18n/routing";
import { isPending } from "@/lib/pending-actions";
import { listPublicSlugs } from "@/server/catalog/queries";
import { verticalAvailability } from "@/server/affiliates/verticals";
import { mapLimited, MAX_CONCURRENT_REQUESTS, routeHasPrices } from "@/server/flights/search";

// Letta dal database a ogni richiesta: contiene solo contenuti pubblici (dbPublic).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.NEXT_PUBLIC_SITE_URL;
  const slugs = await listPublicSlugs();
  // Le coppie di voli entrano solo con prezzi (chiamate in cache; senza token nessuna).
  const priced = await mapLimited(POPULAR_ROUTES, MAX_CONCURRENT_REQUESTS, async (route) => ({
    slug: route.slug,
    ok: await routeHasPrices(route),
  }));
  const flightPaths = priced.filter((r) => r.ok).map((r) => `/voli/${r.slug}`);
  // Alloggi e noleggi entrano solo quando il partner è pronto (ID configurato): altrimenti sono "in arrivo" e noindex.
  const [lodgingReady, carReady] = await Promise.all([
    verticalAvailability("lodging").then((s) => s === "ready"),
    verticalAvailability("car").then((s) => s === "ready"),
  ]);

  const paths = [
    "",
    "/attivita",
    "/itinerari",
    "/voli",
    "/affiliazioni",
    ...(lodgingReady ? ["/dove-dormire"] : []),
    ...(carReady ? ["/noleggio-auto"] : []),
    "/crediti-foto",
    // Pagine con testi ancora in sospeso: fuori dalla sitemap (e noindex) finché non sono scritte.
    ...(isPending("about.editorial", "about.founder") ? [] : ["/chi-siamo"]),
    ...(isPending("legal.privacy") ? [] : ["/privacy"]),
    ...(isPending("legal.cookie") ? [] : ["/cookie"]),
    ...(isPending("legal.terms") ? [] : ["/condizioni-di-vendita"]),
    ...slugs.activities.map((s) => `/attivita/${s}`),
    ...slugs.places.map((s) => `/luoghi/${s}`),
    ...slugs.itineraries.map((s) => `/itinerari/${s}`),
    ...flightPaths,
  ];

  return paths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, `${base}/${l}${path}`])),
      },
    })),
  );
}
