import "server-only";
import { MIN_LONG_SIDE } from "@/lib/media";
import type { CommonsFile } from "@/lib/media-admin";
import { COMMONS_API_HOSTS, parseCommonsResponse, type LicenseOptions } from "./commons";
import { SafeFetchError, type Transport } from "./safe-fetch";
import { wikimediaFetch } from "./wikimedia";

// Ricerca di foto su Wikimedia Commons per un'entità del catalogo (luogo, attività, itinerario,
// area), in due passi, tutti con richieste verso commons.wikimedia.org (wikimediaFetch):
// 1. elenco leggero (solo misure e tipo) da tre interrogazioni: per posizione (entro 10 km),
//    per nome filtrata sulle licenze ammesse, per nome libera. Si scartano subito i file
//    piccoli, non fotografici, mappe e stemmi, e si ordinano per pertinenza del titolo;
// 2. dettagli (licenza, autore, descrizione, miniatura) dei migliori, a gruppi piccoli: l'API
//    non restituisce questi dati per decine di file in una sola risposta.
// Ogni dettaglio passa dagli stessi controlli dell'importatore (parseCommonsResponse); poi si
// scartano i file senza autore o con persone riconoscibili e si ordina per pertinenza.

const META_FILTER = "Artist|LicenseShortName|License|LicenseUrl|ImageDescription|ObjectName|Restrictions";
const PREVIEW_WIDTH = 960;
const DETAIL_BATCH = 10;
const DETAIL_TOP = 20;
const PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff"]);

export type SearchTarget = {
  // Nome mostrato e usato per la pertinenza ("Valle dei Templi", "Corso di cous cous trapanese").
  name: string;
  // Testo della ricerca per nome (di solito le parole chiave del nome).
  query: string;
  lat?: number | null;
  lng?: number | null;
  // Per i luoghi e le aree basta la vicinanza; per attività e itinerari serve anche il nome.
  requireNameMatch: boolean;
};

export type CommonsCandidate = CommonsFile & { previewUrl: string; score: number; matched: string[] };

// Parole che non distinguono un soggetto: articoli, preposizioni, parole da itinerario.
const STOPWORDS = new Set(
  (
    "di del della dello dei degli delle da dal dalla e ed a al alla allo ai agli alle il lo la i gli le un una uno " +
    "in nel nella nei con per su sul sulla tra fra o the of and to at on tour visita giro giorno giorni weekend " +
    "settimana viaggio itinerario sicilia sicily corso escursione esperienza degustazione notte sera mattina"
  ).split(" "),
);

// Titoli che non sono foto del soggetto.
const NOT_A_PHOTO = /\b(map|mappa|karte|carte|locator|logo|stemma|coat of arms|wappen|blason|flag|bandiera|diagram|schema|pianta|plan|grafico|chart|svg|scan|francobollo|stamp|postcard|cartolina)\b/i;

export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\[demo\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function keywords(name: string) {
  return [...new Set(normalize(name).split(" ").filter((w) => w.length > 2 && !STOPWORDS.has(w)))];
}

// Pertinenza: quota delle parole chiave del nome presenti in titolo e descrizione del file
// (anche come inizio di parola: "cous" in "couscous"), più un bonus per la vicinanza e per le
// foto orizzontali (si ritagliano meglio in 16:9).
export function scoreCandidate(
  file: Pick<CommonsFile, "title" | "description" | "width" | "height">,
  words: string[],
  fromGeo: boolean,
) {
  const haystack = ` ${normalize(`${file.title} ${file.description ?? ""}`)} `;
  const matched = words.filter((w) => haystack.includes(` ${w}`));
  const share = words.length === 0 ? 0 : matched.length / words.length;
  const score = share * 10 + (fromGeo ? 3 : 0) + (file.width >= file.height * 1.2 ? 1 : 0);
  return { score: Math.round(score * 100) / 100, matched };
}

function apiUrl(params: Record<string, string>) {
  return `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", formatversion: "2", ...params })}`;
}

// Licenze ammesse nei dati strutturati di Commons (P275 licenza, P6216 stato del copyright):
// CC0, CC BY 2.0/2.5/3.0/4.0, pubblico dominio; con allowSa anche CC BY-SA 2.0/2.5/3.0/4.0.
const LICENSE_FILTER = ["P275=Q6938433", "P275=Q19125117", "P275=Q18810333", "P275=Q14947546", "P275=Q20007257", "P6216=Q19652"];
const SA_FILTER = ["P275=Q19068220", "P275=Q19113751", "P275=Q14946043", "P275=Q18199165"];

// Passo 1: interrogazioni leggere (solo misure e tipo dei file).
export function searchUrls(target: SearchTarget, options: LicenseOptions = {}) {
  const lite = { prop: "imageinfo", iiprop: "size|mime" };
  const licenses = [...LICENSE_FILTER, ...(options.allowSa ? SA_FILTER : [])].join("|");
  const urls: Array<{ url: string; geo: boolean }> = [];
  if (target.lat != null && target.lng != null) {
    urls.push({
      geo: true,
      url: apiUrl({
        ...lite,
        generator: "geosearch",
        ggscoord: `${target.lat}|${target.lng}`,
        ggsradius: "10000",
        ggsnamespace: "6",
        ggslimit: "50",
      }),
    });
  }
  urls.push({
    geo: false,
    url: apiUrl({
      ...lite,
      generator: "search",
      gsrsearch: `${target.query} filetype:bitmap haswbstatement:${licenses}`,
      gsrnamespace: "6",
      gsrlimit: "50",
    }),
  });
  urls.push({
    geo: false,
    url: apiUrl({ ...lite, generator: "search", gsrsearch: `${target.query} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "50" }),
  });
  return urls;
}

// Passo 2: dettagli di un gruppo di file (licenza, autore, descrizione, miniatura).
export function detailsUrl(titles: string[], extra: Record<string, string> = {}) {
  return apiUrl({
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(PREVIEW_WIDTH),
    iiextmetadatalanguage: "it",
    iiextmetadatafilter: META_FILTER,
    titles: titles.join("|"),
    ...extra,
  });
}

// Perché i file trovati sono stati scartati: si mostra all'admin quando una ricerca non
// trova niente ("150 risultati: 31 con licenza non ammessa…").
export type SearchStats = { found: number; license: number; small: number; other: number; unfit: number };
export const emptyStats = (): SearchStats => ({ found: 0, license: 0, small: 0, other: 0, unfit: 0 });

type LitePage = { title: string; width: number; height: number; geo: boolean; text: boolean };
type ApiPage = { title?: string; index?: number; missing?: boolean; imageinfo?: Array<Record<string, unknown>> };
const pagesOf = (json: unknown) => ((json as { query?: { pages?: ApiPage[] } })?.query?.pages ?? []) as ApiPage[];

// Unisce i risultati leggeri delle interrogazioni, uno per file, scartando subito i non adatti.
export function collectLite(results: Array<{ json: unknown; geo: boolean }>, stats: SearchStats = emptyStats()): LitePage[] {
  const byTitle = new Map<string, LitePage>();
  const seen = new Set<string>();
  for (const { json, geo } of results) {
    for (const page of [...pagesOf(json)].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
      if (!page.title) continue;
      const existing = byTitle.get(page.title);
      if (existing) {
        if (geo) existing.geo = true;
        else existing.text = true;
        continue;
      }
      if (seen.has(page.title)) continue;
      seen.add(page.title);
      stats.found++;
      const info = page.imageinfo?.[0];
      const width = Number(info?.width);
      const height = Number(info?.height);
      if (!info || !PHOTO_MIME.has(String(info.mime ?? ""))) {
        stats.other++;
        continue;
      }
      if (!(Math.max(width, height) >= MIN_LONG_SIDE)) {
        stats.small++;
        continue;
      }
      if (NOT_A_PHOTO.test(page.title)) {
        stats.unfit++;
        continue;
      }
      byTitle.set(page.title, { title: page.title, width, height, geo, text: !geo });
    }
  }
  return [...byTitle.values()];
}

export function rankCandidates(
  details: CommonsFile[],
  origin: ReadonlyMap<string, { geo: boolean; text: boolean }>,
  target: SearchTarget,
  exclude: ReadonlySet<string> = new Set(),
  stats: SearchStats = emptyStats(),
): CommonsCandidate[] {
  const words = keywords(target.name);
  // Attività e itinerari: almeno metà delle parole chiave del nome nel titolo o nella
  // descrizione. Luoghi e aree: basta la vicinanza, o una parola chiave per i risultati per nome.
  const needed = target.requireNameMatch ? Math.max(1, Math.ceil(words.length / 2)) : 1;
  const ranked: CommonsCandidate[] = [];
  for (const file of details) {
    if (!file.pageUrl || exclude.has(file.pageUrl)) continue;
    // Serve un autore (la didascalia lo cita) e niente persone riconoscibili senza consenso.
    if (!file.author || file.warnings.includes("personality")) {
      stats.unfit++;
      continue;
    }
    const { geo, text } = origin.get(file.title) ?? { geo: false, text: true };
    const { score, matched } = scoreCandidate(file, words, geo);
    if (matched.length < needed && (target.requireNameMatch || !geo)) {
      stats.unfit++;
      continue;
    }
    ranked.push({ ...file, previewUrl: file.downloadUrl, score: score + (geo && text ? 2 : 0), matched });
  }
  return ranked.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export type SearchResult =
  | { ok: true; candidates: CommonsCandidate[]; stats: SearchStats }
  | { ok: false; error: `fetch_${SafeFetchError["code"]}` | "metadata_unavailable"; detail?: string };

export async function searchCommons(
  target: SearchTarget,
  exclude: ReadonlySet<string> = new Set(),
  transport?: Transport,
  options: LicenseOptions & { sleep?: (ms: number) => Promise<void> } = {},
): Promise<SearchResult> {
  const stats = emptyStats();
  const get = async (url: string) => {
    const res = await wikimediaFetch(url, {
      allowedHosts: COMMONS_API_HOSTS,
      contentTypes: ["application/json"],
      maxBytes: 4 * 1024 * 1024,
      timeoutMs: 20_000,
      transport,
      sleep: options.sleep,
    });
    return JSON.parse(res.body.toString("utf8")) as unknown;
  };
  try {
    const lite: Array<{ json: unknown; geo: boolean }> = [];
    for (const { url, geo } of searchUrls(target, options)) lite.push({ json: await get(url), geo });
    const words = keywords(target.name);
    const pool = collectLite(lite, stats)
      .map((p) => ({ ...p, pre: scoreCandidate({ ...p, description: null }, words, p.geo).score + (p.geo && p.text ? 2 : 0) }))
      .sort((a, b) => b.pre - a.pre)
      .slice(0, DETAIL_TOP);
    const origin = new Map(pool.map((p) => [p.title, { geo: p.geo, text: p.text }]));

    const details: CommonsFile[] = [];
    for (let i = 0; i < pool.length; i += DETAIL_BATCH) {
      const titles = pool.slice(i, i + DETAIL_BATCH).map((p) => p.title);
      // L'API può restituire i dettagli a rate ("continue"): si seguono le continuazioni.
      const pages = new Map<string, ApiPage>();
      let extra: Record<string, string> = {};
      for (let round = 0; round < 4; round++) {
        const json = (await get(detailsUrl(titles, extra))) as { continue?: Record<string, string> };
        for (const page of pagesOf(json)) {
          if (!page.title || pages.get(page.title)?.imageinfo?.length) continue;
          pages.set(page.title, page);
        }
        if (!json.continue) break;
        extra = json.continue;
      }
      for (const title of titles) {
        const parsed = parseCommonsResponse({ query: { pages: [pages.get(title) ?? { title, missing: true }] } }, options);
        if (parsed.ok) details.push(parsed.file);
        else if (parsed.error.startsWith("license_")) stats.license++;
        else if (parsed.error === "too_small") stats.small++;
        else {
          // Diagnosi nel terminale del server: il motivo vero dietro "altro".
          if (stats.other === 0) console.warn("Commons: dettagli non validi", { title, error: parsed.error, page: JSON.stringify(pages.get(title) ?? null).slice(0, 500) });
          stats.other++;
        }
      }
    }
    return { ok: true, candidates: rankCandidates(details, origin, target, exclude, stats), stats };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, error: "metadata_unavailable" };
    if (error instanceof SafeFetchError) return { ok: false, error: `fetch_${error.code}`, detail: error.detail };
    return { ok: false, error: "fetch_network" };
  }
}
