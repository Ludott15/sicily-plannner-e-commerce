import "server-only";
import type { CommonsFile } from "@/lib/media-admin";
import { commonsApiUrl, parseCommonsResponse, type LicenseOptions } from "./commons";
import { keywords } from "./commons-search";
import { SafeFetchError, type Transport } from "./safe-fetch";
import { wikimediaFetch } from "./wikimedia";

// Foto principale di Wikipedia/Wikidata per un'entità del catalogo (docs/IMMAGINI.md, "Foto da
// Commons"). L'immagine principale della voce l'hanno scelta i redattori di Wikipedia per quel
// soggetto, quindi è coerente per costruzione, ed è sempre un file di Wikimedia Commons.
// Il punto delicato è la voce: "Catania" non deve diventare "Myriam Catania", né "Teatro
// Massimo" il "Teatro alla Scala". Le voci candidate, in ordine:
// 1. la voce con il titolo uguale al nome (pagine di disambiguazione escluse);
// 2. le voci entro 10 km dalle coordinate dell'entità (ricerca geografica di Wikipedia);
// 3. la ricerca per nome.
// Ogni voce deve avere un titolo coerente con il nome (titleMatch) e, se entità e voce hanno
// coordinate, stare entro MAX_DISTANCE_KM. Poi, per voce: Wikidata (P18; le persone, P31 =
// essere umano, si saltano) e Commons (autore, licenza e misure, come l'importatore).

export const WIKI_HOSTS = ["it.wikipedia.org", "www.wikidata.org"] as const;
const COMMONS_HOSTS = ["commons.wikimedia.org"] as const;
const GEO_RADIUS_M = 10_000;
export const MAX_DISTANCE_KM = 25;

// placeName: il luogo di un'attività o della prima tappa di un itinerario. La voce del luogo
// non vale per l'attività: "Corso di cous cous trapanese" non prende la foto di Trapani, che
// l'attività mostra già con la catena di ripiego.
export type WikiTarget = { name: string; placeName?: string | null; lat?: number | null; lng?: number | null };

export type WikiPhotoResult =
  | { ok: true; file: CommonsFile; article: string }
  | {
      ok: false;
      reason: "no_article" | "no_image" | "not_suitable" | "already_used" | "network";
      detail?: string;
      article?: string;
    };

export type WikiPage = {
  title?: string;
  index?: number;
  missing?: boolean;
  pageimage?: string;
  pageprops?: { wikibase_item?: string; disambiguation?: string };
  coordinates?: Array<{ lat?: number; lon?: number }>;
};

const PAGE_PROPS = {
  action: "query",
  format: "json",
  formatversion: "2",
  prop: "pageimages|pageprops|coordinates",
  piprop: "name",
  pilimit: "max",
  ppprop: "wikibase_item|disambiguation",
  colimit: "max",
  redirects: "1",
};

const wikiUrl = (params: Record<string, string>) => `https://it.wikipedia.org/w/api.php?${new URLSearchParams({ ...PAGE_PROPS, ...params })}`;

export const wikipediaTitleUrl = (name: string) => wikiUrl({ titles: name });
export const wikipediaGeoUrl = (lat: number, lng: number) =>
  wikiUrl({ generator: "geosearch", ggscoord: `${lat}|${lng}`, ggsradius: String(GEO_RADIUS_M), ggslimit: "100" });
export const wikipediaSearchUrl = (name: string) =>
  wikiUrl({ generator: "search", gsrsearch: name, gsrnamespace: "0", gsrlimit: "5" });

// La ricerca di Wikipedia vuole tutte le parole: "Aperitivo e vita notturna alla Vucciria" non
// trova nulla. Questa cerca le parole chiave in alternativa (OR), senza quelle del luogo, e
// lascia a titleMatch la scelta: "Vucciria", "Casa natale di Luigi Pirandello".
export function wikipediaAnyWordUrl(target: WikiTarget): string | null {
  const placeWords = keywords(target.placeName ?? "");
  const words = nameKeywords(target.name).filter((w) => !placeWords.some((p) => sameWord(p, w)));
  if (words.length === 0) return null;
  return wikiUrl({ generator: "search", gsrsearch: words.join(" OR "), gsrnamespace: "0", gsrlimit: "10" });
}

export function wikidataEntityUrl(item: string) {
  const params = new URLSearchParams({ action: "wbgetentities", format: "json", ids: item, props: "claims" });
  return `https://www.wikidata.org/w/api.php?${params}`;
}

type Claim = { mainsnak?: { datavalue?: { value?: unknown } } };

// Immagine (P18) ed "è una persona" (P31 = Q5) dall'elemento Wikidata.
export function readEntity(json: unknown, item: string): { image: string | null; human: boolean } {
  const claims = (json as { entities?: Record<string, { claims?: Record<string, Claim[]> }> })?.entities?.[item]?.claims ?? {};
  const value = claims.P18?.[0]?.mainsnak?.datavalue?.value;
  const human = (claims.P31 ?? []).some((c) => (c.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id === "Q5");
  return { image: typeof value === "string" && value.trim() !== "" ? value.trim() : null, human };
}

// Parole che descrivono l'attività, non il soggetto: "Aperitivo e vita notturna alla Vucciria"
// deve trovare "Vucciria", non "Vita notturna".
const ACTIVITY_WORDS = new Set(
  (
    "aperitivo vita notturna colazione pranzo cena relax giornata passeggiata piedi gita barca kayak giro " +
    "intorno lezione cucina dolci assaggi vista tramonto alba bagno spiaggia trekking"
  ).split(" "),
);
const nameKeywords = (name: string) => {
  const words = keywords(name);
  const subject = words.filter((w) => !ACTIVITY_WORDS.has(w));
  return subject.length > 0 ? subject : words;
};

// Parole troppo generiche per contare come corrispondenza.
const GENERIC = new Set(["san", "santa", "santo", "sant", "santi"]);

// Stessa parola, anche al plurale o al femminile ("barocca"/"barocco", "trapanese"/"trapani")
// o con una lettera di differenza nelle parole lunghe ("Kolymbethra"/"Kolymbetra").
export function sameWord(a: string, b: string) {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min < 5) return false;
  let common = 0;
  while (common < min && a[common] === b[common]) common++;
  if (common >= min - 1) return true;
  return min >= 7 && Math.abs(a.length - b.length) <= 1 && editDistance(a, b) <= 1;
}

function editDistance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length]!;
}

// Voci su infrastrutture e istituzioni: la loro foto non rappresenta il luogo ("Stazione di
// Bronte", "Diocesi di Piazza Armerina", "Strada statale 286 di Castelbuono").
const NOT_A_SUBJECT = new Set(
  (
    "stazione ferrovia ferrovie strada autostrada aeroporto porto diocesi arcidiocesi provincia libero consorzio " +
    "comune circondario mandamento universita ospedale stadio squadra azienda societa battaglia assedio elezioni"
  ).split(" "),
);
export const isNotASubject = (title: string, name: string) => {
  const first = keywords(title)[0] ?? "";
  return NOT_A_SUBJECT.has(first) && !keywords(name).includes(first);
};

// Quanto il titolo della voce corrisponde al nome: null se non è coerente. Coerente se ogni
// parola del titolo è nel nome ("Ortigia" per "Ortigia, Siracusa"; "Catania" per "Catania")
// oppure se titolo e nome hanno almeno due parole significative in comune ("Teatro Massimo
// Vittorio Emanuele" per "Visita al Teatro Massimo"; "Duomo di Cefalù" per "Duomo normanno
// di Cefalù"). Così "Myriam Catania", "Teatro alla Scala" e "Le ceneri di Pirandello" no.
// Con `nearby` (voce entro pochi km dall'entità) basta anche che il titolo contenga tutto il
// nome: "Cattedrale di Noto" per Noto, se la voce del paese non ha una foto adatta.
export function titleMatch(title: string, name: string, options: { nearby?: boolean } = {}): number | null {
  const nameWords = nameKeywords(name);
  const titleWords = keywords(title);
  if (nameWords.length === 0 || titleWords.length === 0) return null;
  const shared = nameWords.filter((n) => !GENERIC.has(n) && titleWords.some((t) => sameWord(n, t))).length;
  if (shared === 0) return null;
  const covered = titleWords.every((t) => nameWords.some((n) => sameWord(n, t)));
  const contains = options.nearby === true && shared === nameWords.length;
  if (!covered && shared < 2 && !contains) return null;
  return shared * 10 + (covered ? 5 : 0) - titleWords.length;
}

// Il titolo parla solo del luogo (es. "Trapani" per un'attività a Trapani)?
const onlyPlace = (title: string, placeName: string | null | undefined) => {
  if (!placeName) return false;
  const placeWords = keywords(placeName);
  return keywords(title).every((t) => placeWords.some((p) => sameWord(p, t)));
};

// "Noto (Italia)" → "Noto": il qualificatore tra parentesi si ignora solo per le voci vicine
// (con coordinate entro la distanza massima), non per "Caltagirone (azienda)".
const withoutQualifier = (title: string) => title.replace(/\s*\([^)]*\)\s*$/, "").trim() || title;

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const pagesOf = (json: unknown) => ((json as { query?: { pages?: WikiPage[] } })?.query?.pages ?? []) as WikiPage[];
const coordsOf = (page: WikiPage) => {
  const c = page.coordinates?.[0];
  return typeof c?.lat === "number" && typeof c?.lon === "number" ? { lat: c.lat, lng: c.lon } : null;
};
const placeOf = (target: WikiTarget) =>
  typeof target.lat === "number" && typeof target.lng === "number" ? { lat: target.lat, lng: target.lng } : null;

// Voci utilizzabili di una risposta, dalla più coerente: titolo coerente, niente pagine
// mancanti o di disambiguazione, niente voci lontane dall'entità.
export function pickArticles(json: unknown, target: WikiTarget): WikiPage[] {
  const here = placeOf(target);
  return pagesOf(json)
    .flatMap((page) => {
      if (!page.title || page.missing || page.pageprops?.disambiguation !== undefined) return [];
      const there = coordsOf(page);
      const km = here && there ? distanceKm(here, there) : null;
      if (km !== null && km > MAX_DISTANCE_KM) return [];
      const nearby = km !== null;
      const title = nearby ? withoutQualifier(page.title) : page.title;
      if (onlyPlace(title, target.placeName) || isNotASubject(title, target.name)) return [];
      const score = titleMatch(title, target.name, { nearby });
      if (score === null) return [];
      return [{ page, score, km: km ?? MAX_DISTANCE_KM, index: page.index ?? 0 }];
    })
    .sort((a, b) => b.score - a.score || a.km - b.km || a.index - b.index)
    .map((c) => c.page);
}

export const pickArticle = (json: unknown, target: WikiTarget) => pickArticles(json, target)[0] ?? null;

export async function findWikipediaPhoto(
  target: WikiTarget,
  exclude: ReadonlySet<string> = new Set(),
  options: LicenseOptions & { transport?: Transport; sleep?: (ms: number) => Promise<void> } = {},
): Promise<WikiPhotoResult> {
  const get = async (url: string, hosts: readonly string[]) => {
    const res = await wikimediaFetch(url, {
      allowedHosts: hosts,
      contentTypes: ["application/json"],
      maxBytes: 2 * 1024 * 1024,
      timeoutMs: 20_000,
      transport: options.transport,
      sleep: options.sleep,
    });
    return JSON.parse(res.body.toString("utf8")) as unknown;
  };

  const here = placeOf(target);
  const sources = [
    () => wikipediaTitleUrl(target.name),
    ...(here ? [() => wikipediaGeoUrl(here.lat, here.lng)] : []),
    () => wikipediaSearchUrl(target.name),
    () => wikipediaAnyWordUrl(target),
  ];
  const tried = new Set<string>();
  const seen: string[] = [];
  let last: Exclude<WikiPhotoResult, { ok: true }> = { ok: false, reason: "no_article" };

  try {
    for (const source of sources) {
      const url = source();
      if (!url) continue;
      const json = await get(url, WIKI_HOSTS);
      // Per capire un "nessuna voce": i titoli trovati dalle ricerche per nome.
      if (url.includes("generator=search")) seen.push(...pagesOf(json).flatMap((p) => (p.title ? [p.title] : [])));
      for (const article of pickArticles(json, target)) {
        if (!article.title || tried.has(article.title)) continue;
        tried.add(article.title);
        const result = await photoOfArticle(article, exclude, options, get);
        if (result.ok) return result;
        // Un motivo più utile (licenza, misure) non viene coperto da "nessuna immagine".
        if (last.reason === "no_article" || result.reason !== "no_image") last = result;
      }
    }
    if (last.reason === "no_article" && seen.length > 0) {
      return { ok: false, reason: "no_article", detail: `scartate: ${[...new Set(seen)].slice(0, 4).join(", ")}` };
    }
    return last;
  } catch (error) {
    return { ok: false, reason: "network", detail: error instanceof SafeFetchError ? (error.detail ?? error.code) : undefined };
  }
}

async function photoOfArticle(
  article: WikiPage,
  exclude: ReadonlySet<string>,
  options: LicenseOptions,
  get: (url: string, hosts: readonly string[]) => Promise<unknown>,
): Promise<WikiPhotoResult> {
  const title = article.title!;
  // Prima l'immagine di Wikidata (sempre su Commons), poi quella della voce di Wikipedia
  // (che potrebbe essere un file locale non libero: in quel caso Commons non lo trova).
  const files: string[] = [];
  const item = article.pageprops?.wikibase_item;
  if (item && /^Q\d+$/.test(item)) {
    const entity = readEntity(await get(wikidataEntityUrl(item), WIKI_HOSTS), item);
    if (entity.human) return { ok: false, reason: "not_suitable", article: title, detail: "persona" };
    if (entity.image) files.push(entity.image);
  }
  if (article.pageimage) files.push(article.pageimage);
  const unique = [...new Set(files.map((f) => f.replace(/_/g, " ")))];
  if (unique.length === 0) return { ok: false, reason: "no_image", article: title };

  let last: Exclude<WikiPhotoResult, { ok: true }> = { ok: false, reason: "no_image", article: title };
  for (const file of unique) {
    const parsed = parseCommonsResponse(await get(commonsApiUrl(`File:${file}`), COMMONS_HOSTS), options);
    if (!parsed.ok) {
      // Un file locale di Wikipedia (spesso non libero) non è su Commons: si passa oltre senza
      // coprire il motivo, più utile, del file precedente.
      if (parsed.error === "file_not_found" && last.reason === "not_suitable") continue;
      last = { ok: false, reason: "not_suitable", article: title, detail: parsed.license ? `${parsed.error}: ${parsed.license}` : (parsed.detail ?? parsed.error) };
      continue;
    }
    if (exclude.has(parsed.file.pageUrl)) {
      last = { ok: false, reason: "already_used", article: title };
      continue;
    }
    // Serve un autore (la didascalia lo cita) e niente persone riconoscibili senza consenso.
    if (!parsed.file.author) {
      last = { ok: false, reason: "not_suitable", article: title, detail: "autore mancante" };
      continue;
    }
    if (parsed.file.warnings.includes("personality")) {
      last = { ok: false, reason: "not_suitable", article: title, detail: "persone riconoscibili" };
      continue;
    }
    return { ok: true, file: parsed.file, article: title };
  }
  return last;
}
