import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/brand";
import { provinceName } from "@/lib/provinces";
import { getActivity } from "@/server/catalog/queries";
import { ogContentType, ogImage, ogPhotoBox, ogSize } from "@/server/og/og-image";
import { ogPhoto } from "@/server/og/photo";

// Anteprima per la condivisione della scheda attività (schemi.md, "Condivisione").
export const size = ogSize;
export const contentType = ogContentType;
export const alt = BRAND_NAME;

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const [activity, t] = await Promise.all([getActivity(slug), getTranslations({ locale, namespace: "Og" })]);
  if (!activity) return ogImage({ eyebrow: BRAND_NAME, title: t("fallbackTitle"), stops: [] });
  const photo = await ogPhoto(activity.cover?.media, ogPhotoBox);
  return ogImage({
    eyebrow: t("activity", { province: provinceName(activity.placeProvince) }),
    title: activity.title,
    stops: [activity.placeName],
    photo,
  });
}
