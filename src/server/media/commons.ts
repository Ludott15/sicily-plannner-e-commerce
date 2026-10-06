import "server-only";
import { MAX_UPLOAD_BYTES, MIN_LONG_SIDE } from "@/lib/media";
import type { CommonsError, CommonsFile } from "@/lib/media-admin";

export type { CommonsError, CommonsFile };
import { SafeFetchError, checkUrl, type Transport } from "./safe-fetch";
import { wikimediaFetch } from "./wikimedia";

// Importatore da Wikimedia Commons (percorso sensibile, docs/IMMAGINI.md):
// - l'admin incolla "slug;URL della pagina del file su commons.wikimedia.org";
// - il server legge autore, licenza e descrizione dall'API MediaWiki (extmetadata);
// - accetta solo CC0, CC BY e pubblico dominio; rifiuta CC BY-SA, NC, ND e licenze assenti;
// - scarica il file solo da upload.wikimedia.org, con safeFetch (allowlist, redirect, timeout,
//   dimensione, tipo, nessun indirizzo interno).

export const COMMONS_API_HOSTS = ["commons.wikimedia.org"] as const;
export const COMMONS_FILE_HOSTS = ["upload.wikimedia.org"] as const;
const PAGE_HOSTS = new Set(["commons.wikimedia.org", "commons.m.wikimedia.org"]);

// Larghezza della copia scaricata: abbastanza per la variante più grande con margine per il
// ritaglio, e quasi sempre sotto i 10 MB. Il ridimensionamento rende la foto "modificata".
// 1920 è una delle larghezze standard delle miniature di Wikimedia: le larghezze fuori standard
// vengono limitate o rifiutate.
export const DOWNLOAD_WIDTH = 1920;


// "File:Nome file.jpg" dall'URL della pagina del file (anche versione mobile o ?title=).
export function commonsFileTitle(pageUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !PAGE_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) return null;
  let raw: string | null = null;
  if (url.pathname.startsWith("/wiki/")) raw = url.pathname.slice("/wiki/".length);
  else if (url.pathname === "/w/index.php") raw = url.searchParams.get("title");
  if (!raw) return null;
  let title: string;
  try {
    title = decodeURIComponent(raw).replace(/_/g, " ").trim();
  } catch {
    return null;
  }
  const match = /^(?:File|Image|Immagine):(.+)$/i.exec(title);
  if (!match || /[#<>[\]|{}]/.test(match[1]!)) return null;
  return `File:${match[1]!.trim()}`;
}

export function commonsApiUrl(title: string) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    // Le categorie servono per le licenze multiple (es. GFDL + CC BY-SA): extmetadata ne
    // riporta una sola, le categorie di licenza di Commons tutte.
    prop: "imageinfo|categories",
    cllimit: "max",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(DOWNLOAD_WIDTH),
    iiextmetadatalanguage: "it",
    iiextmetadatafilter: "Artist|Credit|LicenseShortName|License|LicenseUrl|ImageDescription|ObjectName|Restrictions",
    titles: title,
  });
  return `https://commons.wikimedia.org/w/api.php?${params}`;
}

// ---------------------------------------------------------------------------
// Licenze
// ---------------------------------------------------------------------------

export type LicenseDecision =
  | { ok: true; license: string; licenseUrl: string | null }
  | { ok: false; error: Extract<CommonsError, `license_${string}`> };

// License (codice: "cc0", "cc-by-4.0", "cc-by-sa-3.0", "pd") e LicenseShortName ("CC BY 4.0",
// "Public domain") da extmetadata. Prima si cercano le clausole vietate, poi le ammesse.
// CC BY-SA si accetta solo con allowSa: lo decide l'admin, caso per caso o per una ricerca
// (docs/IMMAGINI.md, Licenze). NC e ND non si accettano mai.
export type LicenseOptions = { allowSa?: boolean };

export function classifyLicense(
  meta: { license?: string | null; shortName?: string | null; url?: string | null },
  options: LicenseOptions = {},
): LicenseDecision {
  const code = (meta.license ?? "").trim().toLowerCase();
  const short = (meta.shortName ?? "").trim();
  const tokens = new Set(`${code} ${short.toLowerCase()}`.split(/[\s\-_/,()]+/).filter(Boolean));
  if (!code && !short) return { ok: false, error: "license_missing" };
  if (tokens.has("nc")) return { ok: false, error: "license_nc" };
  if (tokens.has("nd")) return { ok: false, error: "license_nd" };
  const url = meta.url && /^https?:\/\//i.test(meta.url.trim()) ? meta.url.trim().replace(/^http:/i, "https:") : null;
  // I codici hanno spesso un suffisso ("cc-by-sa-3.0-migrated", "cc-by-3.0-it",
  // "cc-by-sa-3.0,2.5,2.0,1.0"): conta la prima versione.
  if (tokens.has("sa")) {
    const bySa = /^cc-by-sa-(\d(?:\.\d)?)/.exec(code) ?? /^cc by-sa (\d(?:\.\d)?)\b/i.exec(short);
    if (!options.allowSa || !bySa) return { ok: false, error: "license_sa" };
    return { ok: true, license: `CC BY-SA ${bySa[1]}`, licenseUrl: url ?? `https://creativecommons.org/licenses/by-sa/${bySa[1]}/` };
  }
  if (code === "cc0" || /^cc0\b/i.test(short)) {
    return { ok: true, license: "CC0 1.0", licenseUrl: url ?? "https://creativecommons.org/publicdomain/zero/1.0/" };
  }
  const by = /^cc-by-(\d(?:\.\d)?)/.exec(code) ?? /^cc by (\d(?:\.\d)?)\b/i.exec(short);
  if (by) return { ok: true, license: `CC BY ${by[1]}`, licenseUrl: url ?? `https://creativecommons.org/licenses/by/${by[1]}/` };
  if (code === "pd" || code.startsWith("pd-") || /^(public domain|pubblico dominio)$/i.test(short)) {
    return { ok: true, license: "Pubblico dominio", licenseUrl: url };
  }
  return { ok: false, error: "license_not_allowed" };
}

// Licenze dalle categorie del file ("Category:CC-BY-SA-4.0", "Category:CC-Zero",
// "Category:Public domain"…): servono quando il file ha più licenze ed extmetadata riporta
// quella non ammessa (GFDL). Si sceglie la più libera tra quelle ammesse.
export function licenseFromCategories(categories: readonly string[], options: LicenseOptions = {}): LicenseDecision | null {
  const names = categories.map((c) => c.replace(/^Category:/i, "").trim());
  if (names.some((n) => /^CC-Zero$/i.test(n))) return classifyLicense({ license: "cc0" });
  if (names.some((n) => /^Public domain\b|^PD[- ]/i.test(n))) return classifyLicense({ license: "pd" });
  const by = names.map((n) => /^CC-BY-(\d\.\d)\b/i.exec(n)).find(Boolean);
  if (by) return classifyLicense({ license: `cc-by-${by[1]}` });
  const bySa = names.map((n) => /^CC-BY-SA-(\d\.\d)\b/i.exec(n)).find(Boolean);
  if (bySa && options.allowSa) return classifyLicense({ license: `cc-by-sa-${bySa[1]}` }, options);
  return null;
}

// ---------------------------------------------------------------------------
// HTML di extmetadata → solo testo e link
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const n = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

export function htmlToText(html: string, maxLength = 300): string {
  const text = decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, " ")
      // Tag con attributi tra virgolette che possono contenere ">".
      .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, " ")
      // Un "<" rimasto senza ">" (tag troncato) non deve sopravvivere.
      .replace(/<[^>]*$/g, " "),
  )
    // Caratteri di controllo e di formattazione invisibili.
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

// Autore: testo pulito più il primo link http(s) (pagina utente di Commons o sito
// dell'autore). Qualsiasi altro schema (javascript:, data:) viene scartato.
export function cleanAuthor(html: string | null | undefined): { author: string | null; authorUrl: string | null } {
  if (!html) return { author: null, authorUrl: null };
  const author = htmlToText(html, 200) || null;
  let authorUrl: string | null = null;
  const withoutScripts = html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ");
  for (const match of withoutScripts.matchAll(/<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const raw = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "").trim();
    try {
      const url = new URL(raw, "https://commons.wikimedia.org/");
      if (url.protocol === "https:" || url.protocol === "http:") {
        url.protocol = "https:";
        authorUrl = url.toString();
        break;
      }
    } catch {
      // link non valido: si prova il successivo
    }
  }
  return { author, authorUrl };
}

// ---------------------------------------------------------------------------
// Metadati dall'API
// ---------------------------------------------------------------------------


type ExtValue = { value?: unknown } | undefined;
const ext = (meta: Record<string, ExtValue> | undefined, key: string) => {
  const value = meta?.[key]?.value;
  return typeof value === "string" ? value : null;
};

export function parseCommonsResponse(
  json: unknown,
  options: LicenseOptions = {},
): { ok: true; file: CommonsFile } | { ok: false; error: CommonsError; license?: string } {
  const page = (json as { query?: { pages?: unknown[] } })?.query?.pages?.[0] as
    | { title?: string; missing?: boolean; imageinfo?: Array<Record<string, unknown>>; categories?: Array<{ title?: string }> }
    | undefined;
  if (!page || page.missing || !page.imageinfo?.[0]) return { ok: false, error: "file_not_found" };
  const info = page.imageinfo[0]!;
  const meta = info.extmetadata as Record<string, ExtValue> | undefined;
  if (!meta) return { ok: false, error: "metadata_unavailable" };

  const shortName = htmlToText(ext(meta, "LicenseShortName") ?? "", 80);
  let decision = classifyLicense({ license: ext(meta, "License"), shortName, url: ext(meta, "LicenseUrl") }, options);
  if (!decision.ok && decision.error !== "license_nc" && decision.error !== "license_nd") {
    const fromCategories = licenseFromCategories((page.categories ?? []).map((c) => c.title ?? ""), options);
    if (fromCategories?.ok) decision = fromCategories;
  }
  if (!decision.ok) return { ok: false, error: decision.error, license: shortName || (ext(meta, "License") ?? undefined) };

  const mime = String(info.mime ?? "");
  const width = Number(info.width);
  const height = Number(info.height);
  if (!["image/jpeg", "image/png", "image/webp", "image/tiff"].includes(mime)) return { ok: false, error: "unsupported_type" };
  if (!Number.isFinite(width) || !Number.isFinite(height) || Math.max(width, height) < MIN_LONG_SIDE) {
    return { ok: false, error: "too_small" };
  }
  // Copia ridotta a DOWNLOAD_WIDTH (thumburl) se l'originale è più largo; altrimenti l'originale.
  const download = String(info.thumburl ?? info.url ?? "");
  try {
    checkUrl(download, COMMONS_FILE_HOSTS);
  } catch (error) {
    return { ok: false, error: `fetch_${(error as SafeFetchError).code ?? "invalid_url"}` as CommonsError };
  }
  const pageUrl = String(info.descriptionurl ?? "");
  // Autore: Artist; se manca, Credit (tranne le diciture generiche come "Opera propria").
  let { author, authorUrl } = cleanAuthor(ext(meta, "Artist"));
  if (!author) {
    const credit = cleanAuthor(ext(meta, "Credit"));
    if (credit.author && !/^(own work|opera propria|travail personnel|eigenes werk|trabajo propio)\b/i.test(credit.author)) {
      ({ author, authorUrl } = credit);
    }
  }
  const restrictions = (ext(meta, "Restrictions") ?? "").toLowerCase();
  return {
    ok: true,
    file: {
      title: String(page.title ?? ""),
      pageUrl: /^https:\/\/commons\.wikimedia\.org\//.test(pageUrl) ? pageUrl : "",
      downloadUrl: download,
      width,
      height,
      mime,
      author,
      authorUrl,
      license: decision.license,
      licenseUrl: decision.licenseUrl,
      description: htmlToText(ext(meta, "ImageDescription") ?? ext(meta, "ObjectName") ?? "", 250) || null,
      warnings: restrictions.split("|").filter((r) => r === "personality" || r === "trademarked" || r === "cultural-heritage"),
    },
  };
}

// ---------------------------------------------------------------------------
// Rete
// ---------------------------------------------------------------------------

function fetchError(error: unknown): CommonsError {
  return error instanceof SafeFetchError ? `fetch_${error.code}` : "fetch_network";
}

// Dettaglio dell'errore da mostrare all'admin (es. il codice HTTP di un rifiuto di Wikimedia).
const errorDetail = (error: unknown) => (error instanceof SafeFetchError ? error.detail : undefined);

export async function fetchCommonsFile(pageUrl: string, transport?: Transport, options: LicenseOptions = {}) {
  const title = commonsFileTitle(pageUrl);
  if (!title) return { ok: false as const, error: "invalid_page_url" as CommonsError };
  try {
    const res = await wikimediaFetch(commonsApiUrl(title), {
      allowedHosts: COMMONS_API_HOSTS,
      contentTypes: ["application/json"],
      maxBytes: 2 * 1024 * 1024,
      timeoutMs: 20_000,
      transport,
    });
    return parseCommonsResponse(JSON.parse(res.body.toString("utf8")), options);
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false as const, error: "metadata_unavailable" as CommonsError };
    return { ok: false as const, error: fetchError(error), detail: errorDetail(error) };
  }
}

export async function downloadCommonsFile(downloadUrl: string, transport?: Transport) {
  try {
    const res = await wikimediaFetch(downloadUrl, {
      allowedHosts: COMMONS_FILE_HOSTS,
      contentTypes: ["image/jpeg", "image/png", "image/webp"],
      maxBytes: MAX_UPLOAD_BYTES,
      timeoutMs: 30_000,
      transport,
    });
    return { ok: true as const, body: res.body };
  } catch (error) {
    return { ok: false as const, error: fetchError(error), detail: errorDetail(error) };
  }
}

// "slug;URL" per riga; righe vuote ignorate. Il separatore può essere anche una tabulazione.
export function parseImportLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line, i) => ({ line: i + 1, raw: line.trim() }))
    .filter((l) => l.raw !== "")
    .map(({ line, raw }) => {
      const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\s*[;\t]\s*(\S+)$/.exec(raw);
      return match ? { line, slug: match[1]!, url: match[2]! } : { line, slug: null, url: null };
    });
}
