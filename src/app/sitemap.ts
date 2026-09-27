import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { routing } from "@/lib/i18n/routing";
import { listPublicSlugs } from "@/server/catalog/queries";

// Letta dal database a ogni richiesta: contiene solo contenuti pubblici (dbPublic).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.NEXT_PUBLIC_SITE_URL;
  const slugs = await listPublicSlugs();

  const paths = [
    "",
    "/attivita",
    "/itinerari",
    ...slugs.activities.map((s) => `/attivita/${s}`),
    ...slugs.places.map((s) => `/luoghi/${s}`),
    ...slugs.itineraries.map((s) => `/itinerari/${s}`),
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
