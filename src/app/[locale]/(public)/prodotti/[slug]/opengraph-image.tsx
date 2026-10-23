import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/brand";
import { getProduct } from "@/server/shop/queries";
import { ogContentType, ogImage, ogPhotoBox, ogSize } from "@/server/og/og-image";
import { ogPhoto } from "@/server/og/photo";

// Anteprima per la condivisione del prodotto: la foto e il produttore di origine.
export const size = ogSize;
export const contentType = ogContentType;
export const alt = BRAND_NAME;

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const [product, t] = await Promise.all([getProduct(slug, locale), getTranslations({ locale, namespace: "Og" })]);
  if (!product) return ogImage({ eyebrow: BRAND_NAME, title: t("fallbackTitle"), stops: [] });
  const photo = await ogPhoto(product.gallery[0], ogPhotoBox);
  return ogImage({
    eyebrow: t("product", { producer: product.producer.name }),
    title: product.title,
    stops: [product.producer.name],
    photo,
  });
}
