import { getTranslations } from "next-intl/server";
import { provinceName } from "@/lib/provinces";
import { getActivity } from "@/server/catalog/queries";
import { ogContentType, ogImage, ogSize } from "@/server/og/og-image";

// Anteprima per la condivisione della scheda attività (schemi.md, "Condivisione").
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Isula";

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const [activity, t] = await Promise.all([getActivity(slug), getTranslations({ locale, namespace: "Og" })]);
  if (!activity) return ogImage({ eyebrow: "Isula", title: t("fallbackTitle"), stops: [] });
  return ogImage({
    eyebrow: t("activity", { province: provinceName(activity.placeProvince) }),
    title: activity.title,
    stops: [activity.placeName],
  });
}
