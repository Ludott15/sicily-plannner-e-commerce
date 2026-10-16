import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { SITEMAP_TYPES } from "@/lib/sitemap-types";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Area utente, admin, API e link pubblici dei viaggi (/v/<token>) non vanno indicizzate.
      disallow: ["/api/", "/*/login", "/*/profilo", "/*/admin", "/*/dev/", "/*/viaggio/", "/*/preferenze", "/*/v/"],
    },
    // Una sitemap per tipo (l'indice /sitemap.xml le elenca tutte, ma le dichiariamo una per una).
    sitemap: SITEMAP_TYPES.map((type) => `${publicEnv.NEXT_PUBLIC_SITE_URL}/sitemap/${type}.xml`),
  };
}
