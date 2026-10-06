import { getImageProps, type ImageLoader } from "next/image";
import {
  cropRect,
  mediaUrl,
  pickVariantWidth,
  variantPath,
  variantWidths,
  type CoverMedia,
  type Ratio,
  type VariantFormat,
} from "@/lib/media";

// Immagine del catalogo (docs/IMMAGINI.md): <picture> con AVIF e WebP ritagliati sul punto
// focale, srcset e sizes da next/image (getImageProps con un loader che sceglie la variante
// già generata), segnaposto sfocato come sfondo finché la variante non arriva.
// Le illustrazioni (SVG) si servono così come sono.

type Props = {
  cover: CoverMedia;
  ratio: Ratio;
  sizes: string;
  locale: string;
  priority?: boolean;
  className?: string;
  // Testo alternativo vuoto per le immagini decorative (card con il titolo accanto).
  decorative?: boolean;
};

export function coverAlt(cover: CoverMedia, locale: string) {
  return (locale === "en" ? cover.altEn || cover.altIt : cover.altIt) ?? "";
}

export function CoverPicture({ cover, ratio, sizes, locale, priority = false, className, decorative = false }: Props) {
  const alt = decorative ? "" : coverAlt(cover, locale);
  const imgClass = ["block size-full object-cover", className].filter(Boolean).join(" ");

  if (cover.kind === "illustration" || cover.variantsVersion === 0) {
    return (
      // Le illustrazioni sono SVG vettoriali: nessuna variante da scegliere.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={mediaUrl(cover.storagePath)}
        alt={alt}
        width={cover.width}
        height={cover.height}
        loading={priority ? "eager" : "lazy"}
        className={imgClass}
      />
    );
  }

  const rect = cropRect(cover.width, cover.height, ratio, cover.focalX, cover.focalY);
  const available = variantWidths(rect.width);
  const loaderFor =
    (format: VariantFormat): ImageLoader =>
    ({ width }) =>
      mediaUrl(variantPath(cover.id, cover.variantsVersion, ratio, pickVariantWidth(width, available), format));

  // Se il riquadro della pagina ha un rapporto diverso dalla variante, object-cover taglia
  // ancora: si tiene al centro il punto focale, riportato nelle coordinate del ritaglio.
  const objectPosition = `${Math.round(((cover.focalX * cover.width - rect.left) / rect.width) * 100)}% ${Math.round(
    ((cover.focalY * cover.height - rect.top) / rect.height) * 100,
  )}%`;
  // Immagine principale della pagina (LCP): caricata subito e con priorità alta. In un
  // <picture> si usa fetchPriority, non preload, che scaricherebbe anche il formato scartato.
  const common = {
    src: `${cover.id}-${ratio}`,
    alt,
    width: rect.width,
    height: rect.height,
    sizes,
    loading: priority ? ("eager" as const) : ("lazy" as const),
    fetchPriority: priority ? ("high" as const) : undefined,
  };
  const { props: avif } = getImageProps({ ...common, loader: loaderFor("avif") });
  const { props: webp } = getImageProps({ ...common, loader: loaderFor("webp") });

  return (
    <picture className="block size-full">
      <source type="image/avif" srcSet={avif.srcSet} sizes={sizes} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt arriva da webp (getImageProps) */}
      <img
        {...webp}
        className={imgClass}
        style={{
          objectPosition,
          ...(cover.blurDataUrl
            ? { backgroundImage: `url("${cover.blurDataUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }
            : {}),
        }}
      />
    </picture>
  );
}
