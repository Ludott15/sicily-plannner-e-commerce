// Coppie città di partenza → aeroporto siciliano per le pagine /voli/[coppia] (passo 2.1).
// Origin: codice dell'aeroporto di partenza (vedi departures.ts); per le città con più aeroporti
// si usa il principale. Una coppia entra in sitemap solo se ha prezzi (src/app/sitemap.ts).

import type { SicilyAirportCode } from "./airports";

export type PopularRoute = {
  slug: string;
  origin: string;
  destination: SicilyAirportCode;
};

export const POPULAR_ROUTES: readonly PopularRoute[] = [
  { slug: "milano-catania", origin: "MXP", destination: "CTA" },
  { slug: "milano-palermo", origin: "MXP", destination: "PMO" },
  { slug: "roma-catania", origin: "FCO", destination: "CTA" },
  { slug: "roma-palermo", origin: "FCO", destination: "PMO" },
  { slug: "bologna-catania", origin: "BLQ", destination: "CTA" },
  { slug: "bologna-palermo", origin: "BLQ", destination: "PMO" },
  { slug: "torino-catania", origin: "TRN", destination: "CTA" },
  { slug: "napoli-palermo", origin: "NAP", destination: "PMO" },
  { slug: "napoli-catania", origin: "NAP", destination: "CTA" },
  { slug: "firenze-catania", origin: "FLR", destination: "CTA" },
  { slug: "venezia-catania", origin: "VCE", destination: "CTA" },
  { slug: "bari-catania", origin: "BRI", destination: "CTA" },
  { slug: "genova-palermo", origin: "GOA", destination: "PMO" },
  { slug: "londra-catania", origin: "STN", destination: "CTA" },
  { slug: "berlino-palermo", origin: "BER", destination: "PMO" },
  { slug: "monaco-catania", origin: "MUC", destination: "CTA" },
  { slug: "francoforte-catania", origin: "FRA", destination: "CTA" },
  { slug: "parigi-catania", origin: "CDG", destination: "CTA" },
  { slug: "bruxelles-catania", origin: "BRU", destination: "CTA" },
  { slug: "amsterdam-palermo", origin: "AMS", destination: "PMO" },
];

export function findPopularRoute(slug: string): PopularRoute | null {
  return POPULAR_ROUTES.find((route) => route.slug === slug) ?? null;
}
