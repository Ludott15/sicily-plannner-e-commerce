import { describe, expect, it } from "vitest";
import type { Transport } from "./safe-fetch";
import { findWikipediaPhoto, p18FromClaims, pickArticle } from "./wiki-images";

const commonsFile = (name: string, opts: { license?: string; author?: string | null; width?: number } = {}) => ({
  query: {
    pages: [
      {
        title: `File:${name}`,
        imageinfo: [
          {
            width: opts.width ?? 4000,
            height: 3000,
            mime: "image/jpeg",
            url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${encodeURIComponent(name)}`,
            thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(name)}/1920px-x.jpg`,
            descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name.replace(/ /g, "_"))}`,
            extmetadata: {
              License: { value: opts.license ?? "cc-by-sa-4.0" },
              LicenseShortName: { value: opts.license === "cc0" ? "CC0" : "CC BY-SA 4.0" },
              ...(opts.author === null ? {} : { Artist: { value: "Fotografo" } }),
              ImageDescription: { value: "Tempio della Concordia" },
            },
          },
        ],
      },
    ],
  },
});

// Risposte finte per host: ricerca su it.wikipedia, P18 su Wikidata, file su Commons.
function fakeWiki(responses: { search: unknown; claims?: unknown; files?: Record<string, unknown>; fail?: number }) {
  const hosts: string[] = [];
  const transport: Transport = async (url) => {
    hosts.push(url.host);
    const body =
      url.host === "it.wikipedia.org"
        ? responses.search
        : url.host === "www.wikidata.org"
          ? (responses.claims ?? { claims: {} })
          : (responses.files?.[(url.searchParams.get("titles") ?? "").replace(/^File:/, "")] ?? { query: { pages: [{ missing: true }] } });
    const status = responses.fail ?? 200;
    return {
      status,
      header: (name) => (name === "content-type" ? "application/json" : null),
      body: (async function* () {
        yield new TextEncoder().encode(JSON.stringify(body));
      })(),
      cancel: () => {},
    };
  };
  return { transport, hosts };
}

const search = (...pages: Array<{ title: string; pageimage?: string; item?: string }>) => ({
  query: { pages: pages.map((p, i) => ({ title: p.title, index: i + 1, pageimage: p.pageimage, pageprops: p.item ? { wikibase_item: p.item } : undefined })) },
});
const claims = (file: string) => ({ claims: { P18: [{ mainsnak: { datavalue: { value: file } } }] } });
const noSleep = async () => {};

describe("pickArticle", () => {
  it("prende la prima voce che ha una parola chiave del nome", () => {
    expect(pickArticle(search({ title: "Provincia di Agrigento" }, { title: "Agrigento" }), "Agrigento")?.title).toBe("Provincia di Agrigento");
    expect(pickArticle(search({ title: "Etna" }), "Etna versante sud")?.title).toBe("Etna");
    expect(pickArticle(search({ title: "Cuscus" }), "Corso di cous cous trapanese")).toBeNull();
    expect(pickArticle({}, "Noto")).toBeNull();
  });
  it("legge il nome del file da P18", () => {
    expect(p18FromClaims(claims("Agrigento Concordia.jpg"))).toBe("Agrigento Concordia.jpg");
    expect(p18FromClaims({ claims: {} })).toBeNull();
  });
});

describe("findWikipediaPhoto", () => {
  it("usa l'immagine di Wikidata (P18), con licenza CC BY-SA solo se ammessa", async () => {
    const api = () =>
      fakeWiki({
        search: search({ title: "Agrigento", item: "Q13256", pageimage: "Agrigento_panorama.jpg" }),
        claims: claims("Agrigento Concordia.jpg"),
        files: { "Agrigento Concordia.jpg": commonsFile("Agrigento Concordia.jpg") },
      });
    const withSa = await findWikipediaPhoto("Agrigento", new Set(), { allowSa: true, transport: api().transport, sleep: noSleep });
    expect(withSa).toMatchObject({ ok: true, article: "Agrigento", file: { title: "File:Agrigento Concordia.jpg", license: "CC BY-SA 4.0" } });
    const without = await findWikipediaPhoto("Agrigento", new Set(), { transport: api().transport, sleep: noSleep });
    expect(without).toEqual({ ok: false, reason: "not_suitable", article: "Agrigento" });
  });

  it("senza Wikidata usa l'immagine della voce; interroga solo Wikipedia, Wikidata e Commons", async () => {
    const api = fakeWiki({
      search: search({ title: "Erice", pageimage: "Erice_castello.jpg" }),
      files: { "Erice castello.jpg": commonsFile("Erice castello.jpg", { license: "cc0" }) },
    });
    const result = await findWikipediaPhoto("Erice", new Set(), { transport: api.transport, sleep: noSleep });
    expect(result).toMatchObject({ ok: true, file: { title: "File:Erice castello.jpg", license: "CC0 1.0" } });
    expect(api.hosts).toEqual(["it.wikipedia.org", "commons.wikimedia.org"]);
  });

  it("nessuna voce, nessuna immagine, già usata, senza autore", async () => {
    expect(await findWikipediaPhoto("Corso di cous cous trapanese", new Set(), { transport: fakeWiki({ search: search({ title: "Cuscus" }) }).transport, sleep: noSleep })).toEqual({
      ok: false,
      reason: "no_article",
    });
    expect(await findWikipediaPhoto("Noto", new Set(), { transport: fakeWiki({ search: search({ title: "Noto" }) }).transport, sleep: noSleep })).toEqual({
      ok: false,
      reason: "no_image",
      article: "Noto",
    });
    const used = fakeWiki({ search: search({ title: "Noto", pageimage: "Noto.jpg" }), files: { "Noto.jpg": commonsFile("Noto.jpg", { license: "cc0" }) } });
    expect(
      await findWikipediaPhoto("Noto", new Set(["https://commons.wikimedia.org/wiki/File:Noto.jpg"]), { transport: used.transport, sleep: noSleep }),
    ).toEqual({ ok: false, reason: "already_used", article: "Noto" });
    const anonymous = fakeWiki({ search: search({ title: "Noto", pageimage: "Noto.jpg" }), files: { "Noto.jpg": commonsFile("Noto.jpg", { license: "cc0", author: null }) } });
    expect(await findWikipediaPhoto("Noto", new Set(), { transport: anonymous.transport, sleep: noSleep })).toEqual({
      ok: false,
      reason: "not_suitable",
      article: "Noto",
    });
  });

  it("un rifiuto di Wikimedia diventa network con il codice HTTP", async () => {
    expect(await findWikipediaPhoto("Noto", new Set(), { transport: fakeWiki({ search: {}, fail: 403 }).transport, sleep: noSleep })).toEqual({
      ok: false,
      reason: "network",
      detail: "403",
    });
  });
});
