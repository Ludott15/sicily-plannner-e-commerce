import "server-only";
import sharp from "sharp";
import { publicEnv } from "@/lib/env";
import { mediaUrl, variantPath, VARIANT_WIDTHS, type CoverMedia } from "@/lib/media";
import { coverCrop, type Box } from "@/lib/og-crop";

// Foto di copertina per le immagini generate (anteprime social, immagine verticale). Legge la
// variante 4:5 pubblica più larga disponibile dalla route /api/media, come farebbe un visitatore
// anonimo: una foto non pubblica dà null e l'immagine esce senza foto. next/og non legge WebP né
// AVIF, quindi la foto viene ritagliata sul punto focale e ricodificata in JPEG con sharp.
export async function ogPhoto(cover: CoverMedia | null | undefined, target: Box): Promise<string | null> {
  if (!cover || cover.kind !== "photo") return null;
  const input = await fetchVariant(cover);
  if (!input) return null;

  // Una foto che sharp non decodifica non deve far cadere l'anteprima: esce senza foto.
  try {
    const meta = await sharp(input).metadata();
    if (!meta.width || !meta.height) return null;
    const crop = coverCrop({ width: meta.width, height: meta.height }, target, { x: cover.focalX, y: cover.focalY });
    const out = await sharp(input)
      .resize(crop.resize.width, crop.resize.height)
      .extract(crop.extract)
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

async function fetchVariant(cover: CoverMedia): Promise<Buffer | null> {
  for (const width of [...VARIANT_WIDTHS].reverse()) {
    try {
      const url = new URL(
        mediaUrl(variantPath(cover.id, cover.variantsVersion, "4x5", width, "webp")),
        publicEnv.NEXT_PUBLIC_SITE_URL,
      );
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      continue;
    }
  }
  return null;
}
