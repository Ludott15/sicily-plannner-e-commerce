// Immagini del catalogo: costanti e logica pura condivise da server, pagine e admin
// (docs/IMMAGINI.md). Niente accessi al database né a sharp qui: solo calcoli testabili.

export const RATIOS = {
  "4x5": { w: 4, h: 5 },
  "16x9": { w: 16, h: 9 },
  "1x1": { w: 1, h: 1 },
} as const;
export type Ratio = keyof typeof RATIOS;
export const RATIO_KEYS = Object.keys(RATIOS) as Ratio[];

// Larghezze delle varianti: sono anche i deviceSizes di next/image (next.config.ts), così il
// loader trova sempre una variante esatta.
export const VARIANT_WIDTHS = [480, 800, 1200, 1600] as const;
export const VARIANT_FORMATS = ["avif", "webp"] as const;
export type VariantFormat = (typeof VARIANT_FORMATS)[number];

// Regole di caricamento: JPEG, PNG o WebP, al massimo 10 MB, lato lungo di almeno 1600 px.
// Le illustrazioni sono SVG (vettoriali, nessun minimo di pixel).
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MIN_LONG_SIDE = 1600;
export const PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const SVG_MIME = "image/svg+xml";

// Ritaglio più grande possibile con il rapporto richiesto, centrato sul punto focale
// (coordinate relative 0..1) e spostato quanto basta per restare dentro l'immagine.
export function cropRect(width: number, height: number, ratio: Ratio, focalX: number, focalY: number) {
  const r = RATIOS[ratio];
  let w = width;
  let h = Math.round((width * r.h) / r.w);
  if (h > height) {
    h = height;
    w = Math.round((height * r.w) / r.h);
  }
  w = Math.min(w, width);
  h = Math.min(h, height);
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const left = clamp(Math.round(focalX * width - w / 2), width - w);
  const top = clamp(Math.round(focalY * height - h / 2), height - h);
  return { left, top, width: w, height: h };
}

// Larghezze da generare per un ritaglio: quelle standard non più larghe del ritaglio, più
// il ritaglio intero se è più stretto della più piccola (non succede con il minimo di 1600 px).
export function variantWidths(cropWidth: number): number[] {
  const widths: number[] = VARIANT_WIDTHS.filter((w) => w <= cropWidth);
  return widths.length > 0 ? widths : [VARIANT_WIDTHS[0]];
}

export function variantPath(mediaId: string, version: number, ratio: Ratio, width: number, format: VariantFormat) {
  return `${mediaId}/v${version}/${ratio}-${width}.${format}`;
}

// URL pubblico di un file del bucket: passa dalla route /api/media, che lo chiede allo
// storage con il ruolo del visitatore (RLS).
export function mediaUrl(path: string) {
  return `/api/media/${path}`;
}

// Miniatura quadrata (1:1, 480 px) di una copertina per le tappe. Le illustrazioni sono SVG: si usano intere.
export function coverThumbUrl(cover: CoverMedia): string {
  if (cover.kind === "illustration" || cover.variantsVersion === 0) return mediaUrl(cover.storagePath);
  return mediaUrl(variantPath(cover.id, cover.variantsVersion, "1x1", 480, "webp"));
}

// Sceglie la variante: la più piccola larga almeno quanto richiesto, altrimenti la più larga.
export function pickVariantWidth(requested: number, available: readonly number[] = VARIANT_WIDTHS): number {
  const sorted = [...available].sort((a, b) => a - b);
  return sorted.find((w) => w >= requested) ?? sorted[sorted.length - 1]!;
}

// Percorsi accettati dalla route /api/media: varianti, illustrazioni. Mai master né incoming
// (lo storage li negherebbe comunque al pubblico; qui si evita anche la richiesta).
const PUBLIC_PATH = /^[0-9a-f-]{36}\/(v[1-9][0-9]*\/(4x5|16x9|1x1)-[0-9]{2,4}\.(avif|webp)|illustration\.svg)$/;
export function isServablePath(path: string) {
  return PUBLIC_PATH.test(path);
}

// Originale ripulito: solo anteprima dell'admin (scelta del punto focale), mai pubblico.
const MASTER_PATH = /^[0-9a-f-]{36}\/master\.(jpg|png|webp)$/;
export function isMasterPath(path: string) {
  return MASTER_PATH.test(path);
}

// ---------------------------------------------------------------------------
// Catena di ripiego
// ---------------------------------------------------------------------------

// Un media come lo vedono le pagine pubbliche (solo colonne pubbliche, dalla RLS: se non è
// pubblico la query restituisce null e la catena passa all'anello successivo).
export type CoverMedia = {
  id: string;
  storagePath: string;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  altIt: string | null;
  altEn: string | null;
  kind: "photo" | "illustration";
  author: string | null;
  authorUrl: string | null;
  license: string | null;
  licenseUrl: string | null;
  modified: boolean;
  blurDataUrl: string | null;
  variantsVersion: number;
};

export type CoverSource = "own" | "place" | "first_stop" | "area";
export type ResolvedCover = { media: CoverMedia; source: CoverSource } | null;

// Ordine della catena:
//   attività   → propria → luogo → area
//   itinerario → propria → luogo della prima tappa → area di quel luogo
//   luogo      → propria → area
// Ogni anello è un media già filtrato dalla RLS (null se manca o è bloccato). Se tutto manca
// la pagina mostra il segnaposto con il nome (manuale, Fotografia): non succede in produzione,
// perché i controlli di lancio esigono un'illustrazione per ogni area e un'area per ogni luogo.
export function resolveCover(chain: ReadonlyArray<readonly [CoverSource, CoverMedia | null | undefined]>): ResolvedCover {
  for (const [source, media] of chain) {
    if (media) return { media, source };
  }
  return null;
}

export const activityCoverChain = (c: { own?: CoverMedia | null; place?: CoverMedia | null; area?: CoverMedia | null }) =>
  resolveCover([
    ["own", c.own],
    ["place", c.place],
    ["area", c.area],
  ]);

export const itineraryCoverChain = (c: { own?: CoverMedia | null; firstStop?: CoverMedia | null; area?: CoverMedia | null }) =>
  resolveCover([
    ["own", c.own],
    ["first_stop", c.firstStop],
    ["area", c.area],
  ]);

export const placeCoverChain = (c: { own?: CoverMedia | null; area?: CoverMedia | null }) =>
  resolveCover([
    ["own", c.own],
    ["area", c.area],
  ]);

// ---------------------------------------------------------------------------
// Caricamento multiplo: abbinamento per nome file
// ---------------------------------------------------------------------------

// "ortigia-01.jpg" → { slug: "ortigia", index: 1, ext: "jpg" }. Il numero distingue più
// foto della stessa entità; la prima caricata per un'entità senza copertina lo diventa.
const UPLOAD_NAME = /^([a-z0-9]+(?:-[a-z0-9]+)*?)-(\d{2})\.(jpe?g|png|webp|svg)$/;
export function parseUploadName(filename: string) {
  const match = UPLOAD_NAME.exec(filename.trim().toLowerCase());
  if (!match) return null;
  const ext = match[3] === "jpeg" ? "jpg" : match[3]!;
  return { slug: match[1]!, index: Number(match[2]), ext };
}
