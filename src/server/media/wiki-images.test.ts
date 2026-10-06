import { describe, expect, it } from "vitest";
import type { Transport } from "./safe-fetch";
import { findWikipediaPhoto, pickArticle, readEntity } from "./wiki-images";

const commonsFile = (
  name: string,
  opts: { license?: string; short?: string; author?: string | null; credit?: string; width?: number; categories?: string[] } = {},
) => ({
  query: {
    pages: [
      {
        title: `File:${name}`,
        categories: (opts.categories ?? []).map((c) => ({ title: `Category:${c}` })),
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
              LicenseShortName: { value: opts.short ?? (opts.license === "cc0" ? "CC0" : "CC BY-SA 4.0") },
              ...(opts.author === null ? {} : { Artist: { value: "Fotografo" } }),
              ...(opts.credit ? { Credit: { value: opts.credit } } : {}),
              ImageDescription: { value: "Tempio della Concordia" },
            },
          },
        ],
      },
    ],
  },
});

// Risposte finte per host: ricerca su it.wikipedia, P18 su Wikidata, file su Commons.
function fakeWiki(responses: { search: unknown; claims?: Record<string, unknown>; files?: Record<string, unknown>; fail?: number }) {
  const hosts: string[] = [];
  const transport: Transport = async (url) => {
    hosts.push(url.host);
    const body =
      url.host === "it.wikipedia.org"
        ? responses.search
        : url.host === "www.wikidata.org"
          ? (responses.claims?.[url.searchParams.get("ids") ?? ""] ?? { entities: {} })
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
const entity = (item: string, file: string | null, human = false) => ({
  entities: {
    [item]: {
      claims: {
        ...(file ? { P18: [{ mainsnak: { datavalue: { value: file } } }] } : {}),
        P31: [{ mainsnak: { datavalue: { value: { id: human ? "Q5" : "Q515" } } } }],
      },
    },
  },
});
const noSleep = async () => {};

describe("pickArticle", () => {
  it("prende la prima voce che ha una parola chiave del nome", () => {
    expect(pickArticle(search({ title: "Provincia di Agrigento" }, { title: "Agrigento" }), "Agrigento")?.title).toBe("Provincia di Agrigento");
    expect(pickArticle(search({ title: "Etna" }), "Etna versante sud")?.title).toBe("Etna");
    expect(pickArticle(search({ title: "Cuscus" }), "Corso di cous cous trapanese")).toBeNull();
    expect(pickArticle({}, "Noto")).toBeNull();
  });
  it("legge immagine (P18) e persona (P31 = Q5) da Wikidata", () => {
    expect(readEntity(entity("Q1", "Agrigento Concordia.jpg"), "Q1")).toEqual({ image: "Agrigento Concordia.jpg", human: false });
    expect(readEntity(entity("Q2", "Ritratto.jpg", true), "Q2")).toEqual({ image: "Ritratto.jpg", human: true });
    expect(readEntity({}, "Q3")).toEqual({ image: null, human: false });
  });
});

describe("findWikipediaPhoto", () => {
  it("usa l'immagine di Wikidata (P18), con licenza CC BY-SA solo se ammessa", async () => {
    const api = () =>
      fakeWiki({
        search: search({ title: "Agrigento", item: "Q13256", pageimage: "Agrigento_panorama.jpg" }),
        claims: { Q13256: entity("Q13256", "Agrigento Concordia.jpg") },
        files: { "Agrigento Concordia.jpg": commonsFile("Agrigento Concordia.jpg") },
      });
    const withSa = await findWikipediaPhoto("Agrigento", new Set(), { allowSa: true, transport: api().transport, sleep: noSleep });
    expect(withSa).toMatchObject({ ok: true, article: "Agrigento", file: { title: "File:Agrigento Concordia.jpg", license: "CC BY-SA 4.0" } });
    const without = await findWikipediaPhoto("Agrigento", new Set(), { transport: api().transport, sleep: noSleep });
    expect(without).toEqual({ ok: false, reason: "not_suitable", article: "Agrigento", detail: "license_sa: CC BY-SA 4.0" });
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
      detail: "autore mancante",
    });
  });

  it("salta le voci su persone e passa alla successiva", async () => {
    const api = fakeWiki({
      search: search({ title: "Luigi Pirandello", item: "Q1403" }, { title: "Casa natale di Luigi Pirandello", item: "Q3661", pageimage: "Caos.jpg" }),
      claims: { Q1403: entity("Q1403", "Pirandello ritratto.jpg", true), Q3661: entity("Q3661", null) },
      files: { "Caos.jpg": commonsFile("Caos.jpg", { license: "cc0" }) },
    });
    const result = await findWikipediaPhoto("Casa natale di Pirandello", new Set(), { transport: api.transport, sleep: noSleep });
    expect(result).toMatchObject({ ok: true, article: "Casa natale di Luigi Pirandello", file: { title: "File:Caos.jpg" } });
  });

  it("licenze multiple dalle categorie, codici con suffisso, autore dal campo Credit", async () => {
    const gfdl = fakeWiki({
      search: search({ title: "Catania", pageimage: "Catania.jpg" }),
      files: { "Catania.jpg": commonsFile("Catania.jpg", { license: "gfdl", short: "GFDL", categories: ["GFDL", "CC-BY-SA-3.0-migrated", "CC-BY-SA-3.0"] }) },
    });
    expect(await findWikipediaPhoto("Catania", new Set(), { allowSa: true, transport: gfdl.transport, sleep: noSleep })).toMatchObject({
      ok: true,
      file: { license: "CC BY-SA 3.0" },
    });
    const migrated = fakeWiki({
      search: search({ title: "Erice", pageimage: "Erice.jpg" }),
      files: { "Erice.jpg": commonsFile("Erice.jpg", { license: "cc-by-sa-3.0-migrated", short: "CC BY-SA 3.0", author: null, credit: "Mario Rossi" }) },
    });
    expect(await findWikipediaPhoto("Erice", new Set(), { allowSa: true, transport: migrated.transport, sleep: noSleep })).toMatchObject({
      ok: true,
      file: { license: "CC BY-SA 3.0", author: "Mario Rossi" },
    });
    const ownWork = fakeWiki({
      search: search({ title: "Enna", pageimage: "Enna.jpg" }),
      files: { "Enna.jpg": commonsFile("Enna.jpg", { license: "cc0", author: null, credit: "Opera propria" }) },
    });
    expect(await findWikipediaPhoto("Enna", new Set(), { transport: ownWork.transport, sleep: noSleep })).toMatchObject({
      ok: false,
      detail: "autore mancante",
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
