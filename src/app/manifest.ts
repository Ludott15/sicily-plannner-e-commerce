import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { ogColors } from "@generated/design/og";
import { BRAND_NAME } from "@/lib/brand";
import { routing } from "@/lib/i18n/routing";

// Manifest dell'app installata (display standalone): nome dal marchio, colori dai token.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: "Metadata" });
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: t("description"),
    lang: routing.defaultLocale,
    start_url: `/${routing.defaultLocale}`,
    scope: "/",
    display: "standalone",
    background_color: ogColors.calce,
    theme_color: ogColors.coccio,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
