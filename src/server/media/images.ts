import "server-only";
import sharp, { type Metadata } from "sharp";
import {
  MAX_UPLOAD_BYTES,
  MIN_LONG_SIDE,
  RATIO_KEYS,
  VARIANT_FORMATS,
  cropRect,
  variantWidths,
  type Ratio,
  type VariantFormat,
} from "@/lib/media";
import type { UploadRejection } from "@/lib/media-admin";

// Elaborazione delle immagini caricate (admin e importatore Commons), con sharp:
// - controllo del contenuto vero (non dell'estensione né del Content-Type dichiarato);
// - originale ripulito: orientamento applicato e metadati rimossi (EXIF, GPS, XMP, IPTC);
// - varianti AVIF e WebP per 4:5, 16:9 e 1:1 ritagliate sul punto focale;
// - segnaposto sfocato.

export type { UploadRejection };

export type PhotoFormat = "jpeg" | "png" | "webp";
const EXTENSION: Record<PhotoFormat, "jpg" | "png" | "webp"> = { jpeg: "jpg", png: "png", webp: "webp" };

export type InspectedPhoto = { format: PhotoFormat; ext: "jpg" | "png" | "webp"; width: number; height: number };

export async function inspectPhoto(input: Buffer): Promise<{ ok: true; photo: InspectedPhoto } | { ok: false; error: UploadRejection }> {
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: { code: "too_large", bytes: input.byteLength } };
  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    return { ok: false, error: { code: "unreadable" } };
  }
  const format = meta.format;
  if ((format !== "jpeg" && format !== "png" && format !== "webp") || (meta.pages ?? 1) > 1) {
    return { ok: false, error: { code: "unsupported_type", format: format ?? null } };
  }
  if (!meta.width || !meta.height) return { ok: false, error: { code: "unreadable" } };
  // Orientamento EXIF 5-8: la foto si vede ruotata di 90°, quindi larghezza e altezza si scambiano.
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  if (Math.max(width, height) < MIN_LONG_SIDE) return { ok: false, error: { code: "too_small", width, height } };
  return { ok: true, photo: { format, ext: EXTENSION[format], width, height } };
}

// Originale da conservare: orientamento applicato, sRGB, nessun metadato. sharp non copia i
// metadati se non lo si chiede (withMetadata/keepExif): EXIF e GPS spariscono qui.
export async function cleanMaster(input: Buffer, format: PhotoFormat) {
  const pipeline = sharp(input, { failOn: "error" }).rotate().toColourspace("srgb");
  const encoded =
    format === "jpeg"
      ? pipeline.jpeg({ quality: 90, mozjpeg: true })
      : format === "png"
        ? pipeline.png({ compressionLevel: 9 })
        : pipeline.webp({ quality: 90 });
  const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

export type Variant = { ratio: Ratio; width: number; format: VariantFormat; buffer: Buffer };

export async function renderVariants(master: Buffer, width: number, height: number, focalX: number, focalY: number) {
  const variants: Variant[] = [];
  for (const ratio of RATIO_KEYS) {
    const rect = cropRect(width, height, ratio, focalX, focalY);
    for (const w of variantWidths(rect.width)) {
      const resized = sharp(master).extract(rect).resize({ width: w, withoutEnlargement: true });
      for (const format of VARIANT_FORMATS) {
        const buffer =
          format === "avif"
            ? await resized.clone().avif({ quality: 55, effort: 4 }).toBuffer()
            : await resized.clone().webp({ quality: 78 }).toBuffer();
        variants.push({ ratio, width: w, format, buffer });
      }
    }
  }
  return variants;
}

// Segnaposto sfocato: miniatura WebP di 16 px come data URL (poche centinaia di byte).
export async function blurDataUrl(master: Buffer) {
  const data = await sharp(master).resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  return `data:image/webp;base64,${data.toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Illustrazioni SVG
// ---------------------------------------------------------------------------

// Le illustrazioni delle aree sono SVG forniti dalla redazione. Si accettano solo SVG
// statici: niente script, gestori di eventi, contenuti esterni o entità. La route le serve
// comunque con una Content-Security-Policy che vieta gli script.
const SVG_FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [
  [/<script\b/i, "script"],
  [/\son[a-z]+\s*=/i, "event_handler"],
  [/javascript:/i, "javascript_url"],
  [/<foreignObject\b/i, "foreign_object"],
  [/<!ENTITY/i, "entity"],
  [/<(iframe|embed|object)\b/i, "embedded_content"],
  [/(?:xlink:)?href\s*=\s*["'](?!#)/i, "external_reference"],
  [/url\(\s*["']?(?!#)/i, "external_reference"],
  [/@import/i, "external_reference"],
];

export async function inspectSvg(
  input: Buffer,
): Promise<{ ok: true; width: number; height: number } | { ok: false; error: UploadRejection }> {
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: { code: "too_large", bytes: input.byteLength } };
  const text = input.toString("utf8");
  if (!/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)) {
    return { ok: false, error: { code: "unsupported_type", format: null } };
  }
  for (const [pattern, reason] of SVG_FORBIDDEN) {
    if (pattern.test(text)) return { ok: false, error: { code: "unsafe_svg", reason } };
  }
  try {
    const meta = await sharp(input).metadata();
    if (meta.format !== "svg" || !meta.width || !meta.height) return { ok: false, error: { code: "unreadable" } };
    return { ok: true, width: meta.width, height: meta.height };
  } catch {
    return { ok: false, error: { code: "unreadable" } };
  }
}
