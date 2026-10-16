import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/brand";
import { provinceName } from "@/lib/provinces";
import { getPlace } from "@/server/catalog/queries";
import { ogContentType, ogImage, ogPhotoBox, ogSize } from "@/server/og/og-image";
import { ogPhoto } from "@/server/og/photo";

// Anteprima per la condivisione del luogo: la foto di copertina e sulla linea le sue attività.
export const size = ogSize;
export const contentType = ogContentType;
export const alt = BRAND_NAME;

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const [place, t] = await Promise.all([getPlace(slug), getTranslations({ locale, namespace: "Og" })]);
  if (!place) return ogImage({ eyebrow: BRAND_NAME, title: t("fallbackTitle"), stops: [] });
  const photo = await ogPhoto(place.cover?.media, ogPhotoBox);
  return ogImage({
    eyebrow: t("place", { province: provinceName(place.province) }),
    title: place.name,
    stops: place.activities.map((a) => a.title),
    photo,
  });
}
