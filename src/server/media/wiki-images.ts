import "server-only";
import type { CommonsFile } from "@/lib/media-admin";
import { commonsApiUrl, parseCommonsResponse, type LicenseOptions } from "./commons";
import { keywords } from "./commons-search";
import { SafeFetchError, type Transport } from "./safe-fetch";
import { wikimediaFetch } from "./wikimedia";

// Foto principale di Wikipedia/Wikidata per un'entità del catalogo (docs/IMMAGINI.md, "Foto da
// Commons"). L'immagine principale della voce l'hanno scelta i redattori di Wikipedia per quel
// soggetto, quindi è coerente per costruzione, ed è sempre un file di Wikimedia Commons.
// Tre richieste al massimo, una alla volta (wikimediaFetch):
// 1. it.wikipedia: la voce più pertinente per il nome (ricerca, con l'immagine principale e
//    l'elemento Wikidata);
// 2. Wikidata: l'immagine (P18) dell'elemento, se c'è;
// 3. Commons: autore, licenza e descrizione del file, con gli stessi controlli
//    dell'importatore (parseCommonsResponse).

export const WIKI_HOSTS = ["it.wikipedia.org", "www.wikidata.org"] as const;
const COMMONS_HOSTS = ["commons.wikimedia.org"] as const;

export type WikiPhotoResult =
  | { ok: true; file: CommonsFile; article: string }
  | {
      ok: false;
      reason: "no_article" | "no_image" | "not_suitable" | "already_used" | "network";
      detail?: string;
      article?: string;
    };

type WikiPage = { title?: string; index?: number; pageimage?: string; pageprops?: { wikibase_item?: string } };

export function wikipediaSearchUrl(name: string) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: name,
    gsrnamespace: "0",
    gsrlimit: "3",
    prop: "pageimages|pageprops",
    piprop: "name",
    ppprop: "wikibase_item",
    redirects: "1",
  });
  return `https://it.wikipedia.org/w/api.php?${params}`;
}

export function wikidataImageUrl(item: string) {
  const params = new URLSearchParams({ action: "wbgetclaims", format: "json", entity: item, property: "P18" });
  return `https://www.wikidata.org/w/api.php?${params}`;
}

// La voce giusta: la prima (in ordine di pertinenza) il cui titolo ha almeno una parola chiave
// del nome. "Etna versante sud" → "Etna"; "Corso di cous cous trapanese" → "Cuscus" no
// (nessuna parola in comune) → nessuna voce, e l'attività mostra la foto del luogo.
export function pickArticle(json: unknown, name: string): WikiPage | null {
  const words = keywords(name);
  const pages = (((json as { query?: { pages?: WikiPage[] } })?.query?.pages ?? []) as WikiPage[])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return (
    pages.find((p) => {
      const title = keywords(p.title ?? "");
      return words.some((w) => title.some((t) => t.startsWith(w) || w.startsWith(t)));
    }) ?? null
  );
}

export function p18FromClaims(json: unknown): string | null {
  const claims = (json as { claims?: { P18?: Array<{ mainsnak?: { datavalue?: { value?: unknown } } }> } })?.claims?.P18 ?? [];
  const value = claims[0]?.mainsnak?.datavalue?.value;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export async function findWikipediaPhoto(
  name: string,
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

  try {
    const article = pickArticle(await get(wikipediaSearchUrl(name), WIKI_HOSTS), name);
    if (!article?.title) return { ok: false, reason: "no_article" };

    // Prima l'immagine di Wikidata (sempre su Commons), poi quella della voce di Wikipedia
    // (che potrebbe essere un file locale non libero: in quel caso Commons non lo trova).
    const files: string[] = [];
    const item = article.pageprops?.wikibase_item;
    if (item && /^Q\d+$/.test(item)) {
      const p18 = p18FromClaims(await get(wikidataImageUrl(item), WIKI_HOSTS));
      if (p18) files.push(p18);
    }
    if (article.pageimage) files.push(article.pageimage.replace(/_/g, " "));
    const unique = [...new Set(files.map((f) => f.replace(/_/g, " ")))];
    if (unique.length === 0) return { ok: false, reason: "no_image", article: article.title };

    let lastReason: "not_suitable" | "already_used" = "not_suitable";
    for (const file of unique) {
      const parsed = parseCommonsResponse(await get(commonsApiUrl(`File:${file}`), COMMONS_HOSTS), options);
      if (!parsed.ok) continue;
      if (exclude.has(parsed.file.pageUrl)) {
        lastReason = "already_used";
        continue;
      }
      // Serve un autore (la didascalia lo cita) e niente persone riconoscibili senza consenso.
      if (!parsed.file.author || parsed.file.warnings.includes("personality")) continue;
      return { ok: true, file: parsed.file, article: article.title };
    }
    return { ok: false, reason: lastReason, article: article.title };
  } catch (error) {
    return { ok: false, reason: "network", detail: error instanceof SafeFetchError ? (error.detail ?? error.code) : undefined };
  }
}
