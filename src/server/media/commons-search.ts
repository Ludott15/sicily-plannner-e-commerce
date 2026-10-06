import "server-only";
import type { CommonsFile } from "@/lib/media-admin";
import { COMMONS_API_HOSTS, parseCommonsResponse, type LicenseOptions } from "./commons";
import { SafeFetchError, safeFetch, type Transport } from "./safe-fetch";

// Ricerca di foto su Wikimedia Commons per un'entità del catalogo (luogo, attività, itinerario,
// area). Due interrogazioni all'API, entrambe con safeFetch verso commons.wikimedia.org:
// - per posizione: file fotografati entro 3 km dalle coordinate (generator=geosearch);
// - per nome: ricerca testuale nei file (generator=search).
// Ogni risultato passa dagli stessi controlli dell'importatore (parseCommonsResponse: licenza
// CC0, CC BY o pubblico dominio; lato lungo di almeno 1600 px; download da upload.wikimedia.org),
// poi si scartano mappe, stemmi e foto con persone riconoscibili, e si ordina per pertinenza
// con il nome. Il download vero e l'importazione restano a fetchCommonsFile e ingestPhoto.

const META_FILTER = "Artist|LicenseShortName|License|LicenseUrl|ImageDescription|ObjectName|Restrictions";
const PREVIEW_WIDTH = 640;

export type SearchTarget = {
  // Nome mostrato e usato per la pertinenza ("Valle dei Templi", "Corso di cous cous trapanese").
  name: string;
  // Testo della ricerca per nome (di solito il nome, a volte con il luogo).
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

// Pertinenza: quota delle parole chiave del nome presenti in titolo e descrizione del file,
// più un bonus per la vicinanza e per le foto orizzontali (si ritagliano meglio in 16:9).
export function scoreCandidate(
  file: Pick<CommonsFile, "title" | "description" | "width" | "height">,
  words: string[],
  fromGeo: boolean,
) {
  const haystack = ` ${normalize(`${file.title} ${file.description ?? ""}`)} `;
  const matched = words.filter((w) => haystack.includes(` ${w} `) || haystack.includes(` ${w}`));
  const share = words.length === 0 ? 0 : matched.length / words.length;
  const score = share * 10 + (fromGeo ? 3 : 0) + (file.width >= file.height * 1.2 ? 1 : 0);
  return { score: Math.round(score * 100) / 100, matched };
}

function apiUrl(params: Record<string, string>) {
  const search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(PREVIEW_WIDTH),
    iiextmetadatalanguage: "it",
    iiextmetadatafilter: META_FILTER,
    ...params,
  });
  return `https://commons.wikimedia.org/w/api.php?${search}`;
}

// Licenze ammesse nei dati strutturati di Commons (P275 licenza, P6216 stato del copyright):
// CC0, CC BY 2.0/2.5/3.0/4.0, pubblico dominio; con allowSa anche CC BY-SA 2.0/2.5/3.0/4.0.
// La gran parte delle foto su Commons è CC BY-SA: senza questo filtro le poche foto ammesse si
// perdono tra le prime decine di risultati.
const LICENSE_FILTER = ["P275=Q6938433", "P275=Q19125117", "P275=Q18810333", "P275=Q14947546", "P275=Q20007257", "P6216=Q19652"];
const SA_FILTER = ["P275=Q19068220", "P275=Q19113751", "P275=Q14946043", "P275=Q18199165"];

export function searchUrls(target: SearchTarget, options: LicenseOptions = {}) {
  const licenses = [...LICENSE_FILTER, ...(options.allowSa ? SA_FILTER : [])].join("|");
  const urls: Array<{ url: string; geo: boolean }> = [];
  if (target.lat != null && target.lng != null) {
    urls.push({
      geo: true,
      url: apiUrl({
        generator: "geosearch",
        ggscoord: `${target.lat}|${target.lng}`,
        ggsradius: "10000",
        ggsnamespace: "6",
        // Oltre 50 file l'API non restituisce le miniature (iiurlwidth) nella stessa risposta.
        ggslimit: "50",
      }),
    });
  }
  urls.push({
    geo: false,
    url: apiUrl({
      generator: "search",
      gsrsearch: `${target.query} filetype:bitmap haswbstatement:${licenses}`,
      gsrnamespace: "6",
      gsrlimit: "50",
    }),
  });
  urls.push({
    geo: false,
    url: apiUrl({ generator: "search", gsrsearch: `${target.query} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "50" }),
  });
  return urls;
}

// Perché i file trovati sono stati scartati: si mostra all'admin quando una ricerca non
// trova niente ("40 trovate: 31 con licenza non ammessa…").
export type SearchStats = { found: number; license: number; small: number; other: number; unfit: number };
export const emptyStats = (): SearchStats => ({ found: 0, license: 0, small: 0, other: 0, unfit: 0 });

// Pagine di una risposta dell'API → candidati validi (stessi controlli dell'importatore).
export function parseCandidates(json: unknown, options: LicenseOptions = {}, stats: SearchStats = emptyStats()): CommonsFile[] {
  const pages = ((json as { query?: { pages?: unknown[] } })?.query?.pages ?? []) as Array<{ index?: number }>;
  return [...pages]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((page) => {
      stats.found++;
      const parsed = parseCommonsResponse({ query: { pages: [page] } }, options);
      if (parsed.ok) return [parsed.file];
      if (parsed.error.startsWith("license_")) stats.license++;
      else if (parsed.error === "too_small") stats.small++;
      else stats.other++;
      return [];
    });
}

export function rankCandidates(
  results: Array<{ files: CommonsFile[]; geo: boolean }>,
  target: SearchTarget,
  exclude: ReadonlySet<string> = new Set(),
  stats: SearchStats = emptyStats(),
): CommonsCandidate[] {
  const words = keywords(target.name);
  // Un file trovato sia per posizione sia per nome vale di più: si tengono entrambe le provenienze.
  const byPage = new Map<string, { file: CommonsFile; geo: boolean; text: boolean }>();
  for (const { files, geo } of results) {
    for (const file of files) {
      if (!file.pageUrl || exclude.has(file.pageUrl)) continue;
      // Serve un autore (la didascalia lo cita) e niente persone riconoscibili senza consenso.
      if (!file.author || file.warnings.includes("personality") || NOT_A_PHOTO.test(file.title)) {
        stats.unfit++;
        continue;
      }
      const entry = byPage.get(file.pageUrl) ?? { file, geo: false, text: false };
      if (geo) entry.geo = true;
      else entry.text = true;
      byPage.set(file.pageUrl, entry);
    }
  }
  // Attività e itinerari: almeno metà delle parole chiave del nome nel titolo o nella
  // descrizione. Luoghi e aree: basta la vicinanza, o una parola chiave per i risultati per nome.
  const needed = target.requireNameMatch ? Math.max(1, Math.ceil(words.length / 2)) : 1;
  const ranked: CommonsCandidate[] = [];
  for (const { file, geo, text } of byPage.values()) {
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
  | { ok: false; error: `fetch_${SafeFetchError["code"]}` | "metadata_unavailable" };

export async function searchCommons(
  target: SearchTarget,
  exclude: ReadonlySet<string> = new Set(),
  transport?: Transport,
  options: LicenseOptions = {},
): Promise<SearchResult> {
  const results: Array<{ files: CommonsFile[]; geo: boolean }> = [];
  const stats = emptyStats();
  for (const { url, geo } of searchUrls(target, options)) {
    try {
      const res = await safeFetch(url, {
        allowedHosts: COMMONS_API_HOSTS,
        contentTypes: ["application/json"],
        maxBytes: 4 * 1024 * 1024,
        timeoutMs: 15_000,
        transport,
      });
      results.push({ files: parseCandidates(JSON.parse(res.body.toString("utf8")), options, stats), geo });
    } catch (error) {
      if (error instanceof SyntaxError) return { ok: false, error: "metadata_unavailable" };
      return { ok: false, error: error instanceof SafeFetchError ? `fetch_${error.code}` : "fetch_network" };
    }
  }
  return { ok: true, candidates: rankCandidates(results, target, exclude, stats), stats };
}
