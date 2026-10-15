import { getTranslations } from "next-intl/server";
import { getInvitePage } from "@/server/groups/queries";
import { ogContentType, ogImage, ogSize } from "@/server/og/og-image";

// Anteprima dell'invito: il viaggio del gruppo con i luoghi delle tappe. Nessun dato personale
// (né il nome né la foto del proprietario). Un invito non valido dà l'anteprima generica.
export const size = ogSize;
export const contentType = ogContentType;
export const alt = "Isula";

export default async function Image({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  const [invite, t, tOg] = await Promise.all([
    getInvitePage(token),
    getTranslations({ locale, namespace: "GroupInvite" }),
    getTranslations({ locale, namespace: "Og" }),
  ]);
  if (invite.status !== "active") return ogImage({ eyebrow: "Isula", title: tOg("fallbackTitle"), stops: [] });

  const { preview } = invite;
  const eyebrow = preview.itineraryDays
    ? t("ogEyebrow", { days: preview.itineraryDays })
    : t("ogEyebrowPlain");
  return ogImage({
    eyebrow,
    title: preview.itineraryTitle ?? preview.groupName,
    stops: preview.stops,
  });
}
