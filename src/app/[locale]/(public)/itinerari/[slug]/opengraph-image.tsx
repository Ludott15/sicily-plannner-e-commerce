import { getTranslations } from "next-intl/server";
import { getTemplate } from "@/server/catalog/queries";
import { ogContentType, ogImage, ogSize } from "@/server/og/og-image";

// Anteprima per la condivisione dell'itinerario pronto: la linea del percorso con i luoghi
// delle tappe, nell'ordine dei giorni.
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Isula";

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const [itinerary, t] = await Promise.all([getTemplate(slug), getTranslations({ locale, namespace: "Og" })]);
  if (!itinerary) return ogImage({ eyebrow: "Isula", title: t("fallbackTitle"), stops: [] });
  const places = [...new Set(itinerary.items.flatMap((i) => (i.placeName ? [i.placeName] : [])))];
  return ogImage({ eyebrow: t("itinerary", { days: itinerary.days }), title: itinerary.title, stops: places });
}
