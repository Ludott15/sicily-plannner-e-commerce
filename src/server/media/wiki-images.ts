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
// 2. Wikidata: l'immagine (P18) dell'elemento, se c'è; le voci su persone (P31 = essere umano)
//    si saltano, perché la loro immagine è un ritratto ("Casa natale di Pirandello" non deve
//    prendere la foto di Luigi Pirandello);
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

// La voce giusta: la prima (in ordine di pertinenza) il cui titolo ha almeno una parola chiave
// del nome. "Etna versante sud" → "Etna"; "Corso di cous cous trapanese" → "Cuscus" no
// (nessuna parola in comune) → nessuna voce, e l'attività mostra la foto del luogo.
export function pickArticles(json: unknown, name: string): WikiPage[] {
  const words = keywords(name);
  const pages = (((json as { query?: { pages?: WikiPage[] } })?.query?.pages ?? []) as WikiPage[])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages.filter((p) => {
    const title = keywords(p.title ?? "");
    return words.some((w) => title.some((t) => t.startsWith(w) || w.startsWith(t)));
  });
}

export const pickArticle = (json: unknown, name: string) => pickArticles(json, name)[0] ?? null;

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
    const articles = pickArticles(await get(wikipediaSearchUrl(name), WIKI_HOSTS), name);
    if (articles.length === 0) return { ok: false, reason: "no_article" };

    let last: Exclude<WikiPhotoResult, { ok: true }> = { ok: false, reason: "no_article" };
    for (const article of articles) {
      if (!article.title) continue;
      // Prima l'immagine di Wikidata (sempre su Commons), poi quella della voce di Wikipedia
      // (che potrebbe essere un file locale non libero: in quel caso Commons non lo trova).
      const files: string[] = [];
      const item = article.pageprops?.wikibase_item;
      if (item && /^Q\d+$/.test(item)) {
        const entity = readEntity(await get(wikidataEntityUrl(item), WIKI_HOSTS), item);
        if (entity.human) {
          last = { ok: false, reason: "not_suitable", article: article.title, detail: "persona" };
          continue;
        }
        if (entity.image) files.push(entity.image);
      }
      if (article.pageimage) files.push(article.pageimage);
      const unique = [...new Set(files.map((f) => f.replace(/_/g, " ")))];
      if (unique.length === 0) {
        last = { ok: false, reason: "no_image", article: article.title };
        continue;
      }
      for (const file of unique) {
        const parsed = parseCommonsResponse(await get(commonsApiUrl(`File:${file}`), COMMONS_HOSTS), options);
        if (!parsed.ok) {
          // Un file locale di Wikipedia (spesso non libero) non è su Commons: si passa oltre senza
          // coprire il motivo, più utile, del file precedente.
          if (parsed.error === "file_not_found" && last.reason === "not_suitable") continue;
          last = { ok: false, reason: "not_suitable", article: article.title, detail: parsed.license ? `${parsed.error}: ${parsed.license}` : parsed.error };
          continue;
        }
        if (exclude.has(parsed.file.pageUrl)) {
          last = { ok: false, reason: "already_used", article: article.title };
          continue;
        }
        // Serve un autore (la didascalia lo cita) e niente persone riconoscibili senza consenso.
        if (!parsed.file.author) {
          last = { ok: false, reason: "not_suitable", article: article.title, detail: "autore mancante" };
          continue;
        }
        if (parsed.file.warnings.includes("personality")) {
          last = { ok: false, reason: "not_suitable", article: article.title, detail: "persone riconoscibili" };
          continue;
        }
        return { ok: true, file: parsed.file, article: article.title };
      }
    }
    return last;
  } catch (error) {
    return { ok: false, reason: "network", detail: error instanceof SafeFetchError ? (error.detail ?? error.code) : undefined };
  }
}
