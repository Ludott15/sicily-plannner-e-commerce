import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/brand";
import { getTemplate } from "@/server/catalog/queries";
import { ogContentType, ogImage, ogPhotoBox, ogSize } from "@/server/og/og-image";
import { ogPhoto } from "@/server/og/photo";

// Anteprima per la condivisione dell'itinerario pronto: la linea del percorso con i luoghi
// delle tappe, nell'ordine dei giorni, con la foto di copertina.
export const size = ogSize;
export const contentType = ogContentType;
export const alt = BRAND_NAME;

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const [itinerary, t] = await Promise.all([getTemplate(slug), getTranslations({ locale, namespace: "Og" })]);
  if (!itinerary) return ogImage({ eyebrow: BRAND_NAME, title: t("fallbackTitle"), stops: [] });
  const places = [...new Set(itinerary.items.flatMap((i) => (i.placeName ? [i.placeName] : [])))];
  const photo = await ogPhoto(itinerary.cover?.media, ogPhotoBox);
  return ogImage({ eyebrow: t("itinerary", { days: itinerary.days }), title: itinerary.title, stops: places, photo });
}
