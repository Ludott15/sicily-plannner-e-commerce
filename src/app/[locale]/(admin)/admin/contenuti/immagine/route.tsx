import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { provinceName } from "@/lib/provinces";
import { adminVerticalContent } from "@/server/og/vertical.admin";
import { verticalImage } from "@/server/og/vertical-image";

// Immagine verticale 1080×1920 (PNG) per i video: solo admin (requireAdmin dà 404 agli altri).
// Query: tipo=itinerario|luogo e id (uuid). Il file si scarica dalla pagina /admin/contenuti.
const Query = z.object({
  tipo: z.enum(["itinerario", "luogo"]),
  id: z.uuid(),
});

export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const query = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return new Response(null, { status: 404 });

  const content = await adminVerticalContent(query.data.tipo, query.data.id);
  if (!content) return new Response(null, { status: 404 });

  const t = await getTranslations({ locale, namespace: "AdminContent" });
  const og = await getTranslations({ locale, namespace: "Og" });
  const eyebrow =
    content.kind === "itinerario"
      ? og("itinerary", { days: content.days })
      : og("place", { province: provinceName(content.province) });

  return verticalImage(content, {
    eyebrow,
    day: (n) => t("day", { day: n }),
  });
}
