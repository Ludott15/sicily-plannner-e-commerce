import { getTranslations } from "next-intl/server";
import { provinceName } from "@/lib/provinces";
import { getPlace } from "@/server/catalog/queries";
import { ogContentType, ogImage, ogSize } from "@/server/og/og-image";

// Anteprima per la condivisione del luogo: sulla linea le sue attività.
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Isula";

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const [place, t] = await Promise.all([getPlace(slug), getTranslations({ locale, namespace: "Og" })]);
  if (!place) return ogImage({ eyebrow: "Isula", title: t("fallbackTitle"), stops: [] });
  return ogImage({
    eyebrow: t("place", { province: provinceName(place.province) }),
    title: place.name,
    stops: place.activities.map((a) => a.title),
  });
}
