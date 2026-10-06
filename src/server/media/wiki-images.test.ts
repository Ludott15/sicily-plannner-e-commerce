import { describe, expect, it } from "vitest";
import type { Transport } from "./safe-fetch";
import { distanceKm, findWikipediaPhoto, pickArticle, readEntity, titleMatch } from "./wiki-images";

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
function fakeWiki(responses: { search: unknown; exact?: unknown; geo?: unknown; claims?: Record<string, unknown>; files?: Record<string, unknown>; fail?: number }) {
  const hosts: string[] = [];
  const transport: Transport = async (url) => {
    hosts.push(url.host);
    const body =
      url.host === "it.wikipedia.org"
        ? url.searchParams.has("titles")
          ? (responses.exact ?? {})
          : url.searchParams.get("generator") === "geosearch"
            ? (responses.geo ?? {})
            : responses.search
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

type Page = { title: string; pageimage?: string; item?: string; at?: [number, number]; disambiguation?: boolean };
const search = (...pages: Page[]) => ({
  query: {
    pages: pages.map((p, i) => ({
      title: p.title,
      index: i + 1,
      pageimage: p.pageimage,
      pageprops: { ...(p.item ? { wikibase_item: p.item } : {}), ...(p.disambiguation ? { disambiguation: "" } : {}) },
      ...(p.at ? { coordinates: [{ lat: p.at[0], lon: p.at[1] }] } : {}),
    })),
  },
});
const PALERMO = { lat: 38.1157, lng: 13.3615 };
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

describe("scelta della voce", () => {
  it("titolo coerente con il nome: tutte le parole del titolo nel nome, o almeno due in comune", () => {
    expect(titleMatch("Catania", "Catania")).not.toBeNull();
    expect(titleMatch("Ortigia", "Ortigia, Siracusa")).not.toBeNull();
    expect(titleMatch("Etna", "Etna versante sud")).not.toBeNull();
    expect(titleMatch("Teatro Massimo Vittorio Emanuele", "Visita al Teatro Massimo")).not.toBeNull();
    expect(titleMatch("Duomo di Cefalù", "Duomo normanno di Cefalù")).not.toBeNull();
    expect(titleMatch("Castello dei Ventimiglia (Castelbuono)", "Castelbuono e il castello dei Ventimiglia")).not.toBeNull();
    // Dai log: voci sbagliate che prima passavano.
    for (const [title, name] of [
      ["Myriam Catania", "Catania"],
      ["Charlotte Brontë", "Bronte"],
      ["Caltagirone (azienda)", "Caltagirone"],
      ["Strada statale 286 di Castelbuono", "Castelbuono"],
      ["San Gavino Monreale", "Monreale"],
      ["Battaglia di Austerlitz", "Piano Battaglia"],
      ["Trapani Shark", "Trapani"],
      ["Teatro alla Scala", "Visita al Teatro Massimo"],
      ["Duomo di Monreale", "Duomo normanno di Cefalù"],
      ["Le ceneri di Pirandello", "Casa natale di Pirandello"],
      ["Rocca Sanvitale (Fontanellato)", "Castello di Lombardia e Rocca di Cerere"],
      ["Germania Ovest", "Ovest"],
      ["Cuscus", "Corso di cous cous trapanese"],
    ]) {
      expect(titleMatch(title!, name!), `${title} per ${name}`).toBeNull();
    }
  });

  it("voci vicine: qualificatore tra parentesi ignorato e titolo che contiene il nome; mai la voce del luogo per un'attività", () => {
    const NOTO = { lat: 36.8906, lng: 15.0697 };
    expect(pickArticle(search({ title: "Noto (Italia)", at: [36.89, 15.07] }), { name: "Noto", ...NOTO })?.title).toBe("Noto (Italia)");
    expect(pickArticle(search({ title: "Caltagirone (azienda)" }), { name: "Caltagirone", ...NOTO })).toBeNull();
    expect(pickArticle(search({ title: "Cattedrale di Noto", at: [36.893, 15.069] }), { name: "Noto", ...NOTO })?.title).toBe("Cattedrale di Noto");
    expect(pickArticle(search({ title: "Cattedrale di Noto" }), { name: "Noto", ...NOTO })).toBeNull();
    const TRAPANI = { lat: 38.0176, lng: 12.5365 };
    expect(pickArticle(search({ title: "Trapani", at: [38.0176, 12.5365] }), { name: "Corso di cous cous trapanese", placeName: "Trapani", ...TRAPANI })).toBeNull();
    expect(
      pickArticle(search({ title: "Catania", at: [37.5, 15.08] }, { title: "Pescheria di Catania", at: [37.501, 15.085] }), {
        name: "Colazione alla pescheria di Catania",
        placeName: "Catania",
        lat: 37.5,
        lng: 15.08,
      })?.title,
    ).toBe("Pescheria di Catania");
  });

  it("preferisce la voce più coerente e vicina; scarta disambiguazioni e voci lontane", () => {
    const pages = search(
      { title: "Palermo (disambigua)", disambiguation: true },
      { title: "Teatro Massimo (Pescara)", at: [42.46, 14.21] },
      { title: "Teatro Massimo Vittorio Emanuele", at: [38.1202, 13.3572] },
    );
    expect(pickArticle(pages, { name: "Teatro Massimo", ...PALERMO })?.title).toBe("Teatro Massimo Vittorio Emanuele");
    expect(pickArticle(search({ title: "Palermo (disambigua)", disambiguation: true }), { name: "Palermo" })).toBeNull();
    expect(pickArticle({}, { name: "Noto" })).toBeNull();
    expect(distanceKm(PALERMO, { lat: 37.5079, lng: 15.083 })).toBeGreaterThan(160);
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
    const withSa = await findWikipediaPhoto({ name: "Agrigento" }, new Set(), { allowSa: true, transport: api().transport, sleep: noSleep });
    expect(withSa).toMatchObject({ ok: true, article: "Agrigento", file: { title: "File:Agrigento Concordia.jpg", license: "CC BY-SA 4.0" } });
    const without = await findWikipediaPhoto({ name: "Agrigento" }, new Set(), { transport: api().transport, sleep: noSleep });
    expect(without).toEqual({ ok: false, reason: "not_suitable", article: "Agrigento", detail: "license_sa: CC BY-SA 4.0" });
  });

  it("senza Wikidata usa l'immagine della voce; interroga solo Wikipedia, Wikidata e Commons", async () => {
    const api = fakeWiki({
      search: search({ title: "Erice", pageimage: "Erice_castello.jpg" }),
      files: { "Erice castello.jpg": commonsFile("Erice castello.jpg", { license: "cc0" }) },
    });
    const result = await findWikipediaPhoto({ name: "Erice" }, new Set(), { transport: api.transport, sleep: noSleep });
    expect(result).toMatchObject({ ok: true, file: { title: "File:Erice castello.jpg", license: "CC0 1.0" } });
    expect(api.hosts).toEqual(["it.wikipedia.org", "it.wikipedia.org", "commons.wikimedia.org"]);
  });

  it("nessuna voce, nessuna immagine, già usata, senza autore", async () => {
    expect(await findWikipediaPhoto({ name: "Corso di cous cous trapanese" }, new Set(), { transport: fakeWiki({ search: search({ title: "Cuscus" }) }).transport, sleep: noSleep })).toEqual({
      ok: false,
      reason: "no_article",
    });
    expect(await findWikipediaPhoto({ name: "Noto" }, new Set(), { transport: fakeWiki({ search: search({ title: "Noto" }) }).transport, sleep: noSleep })).toEqual({
      ok: false,
      reason: "no_image",
      article: "Noto",
    });
    const used = fakeWiki({ search: search({ title: "Noto", pageimage: "Noto.jpg" }), files: { "Noto.jpg": commonsFile("Noto.jpg", { license: "cc0" }) } });
    expect(
      await findWikipediaPhoto({ name: "Noto" }, new Set(["https://commons.wikimedia.org/wiki/File:Noto.jpg"]), { transport: used.transport, sleep: noSleep }),
    ).toEqual({ ok: false, reason: "already_used", article: "Noto" });
    const anonymous = fakeWiki({ search: search({ title: "Noto", pageimage: "Noto.jpg" }), files: { "Noto.jpg": commonsFile("Noto.jpg", { license: "cc0", author: null }) } });
    expect(await findWikipediaPhoto({ name: "Noto" }, new Set(), { transport: anonymous.transport, sleep: noSleep })).toEqual({
      ok: false,
      reason: "not_suitable",
      article: "Noto",
      detail: "autore mancante",
    });
  });

  it("salta le voci su persone e passa alla successiva", async () => {
    const api = fakeWiki({
      search: search({ title: "Pirandello", item: "Q1403" }, { title: "Casa natale di Luigi Pirandello", item: "Q3661", pageimage: "Caos.jpg" }),
      claims: { Q1403: entity("Q1403", "Pirandello ritratto.jpg", true), Q3661: entity("Q3661", null) },
      files: { "Caos.jpg": commonsFile("Caos.jpg", { license: "cc0" }) },
    });
    const result = await findWikipediaPhoto({ name: "Casa natale di Pirandello" }, new Set(), { transport: api.transport, sleep: noSleep });
    expect(result).toMatchObject({ ok: true, article: "Casa natale di Luigi Pirandello", file: { title: "File:Caos.jpg" } });
    const person = fakeWiki({ search: search({ title: "Pirandello", item: "Q1403" }), claims: { Q1403: entity("Q1403", "Ritratto.jpg", true) } });
    expect(await findWikipediaPhoto({ name: "Pirandello" }, new Set(), { transport: person.transport, sleep: noSleep })).toEqual({
      ok: false,
      reason: "not_suitable",
      article: "Pirandello",
      detail: "persona",
    });
  });

  it("prima il titolo esatto, poi le voci vicine; mai una voce omonima lontana", async () => {
    const cc0 = (name: string) => commonsFile(name, { license: "cc0" });
    const catania = fakeWiki({
      exact: search({ title: "Catania", pageimage: "Catania.jpg", at: [37.5079, 15.083] }),
      search: search({ title: "Myriam Catania", pageimage: "Myriam.jpg" }),
      files: { "Catania.jpg": cc0("Catania.jpg"), "Myriam.jpg": cc0("Myriam.jpg") },
    });
    expect(await findWikipediaPhoto({ name: "Catania", lat: 37.5, lng: 15.08 }, new Set(), { transport: catania.transport, sleep: noSleep })).toMatchObject({
      ok: true,
      article: "Catania",
    });

    const teatro = fakeWiki({
      geo: search({ title: "Palermo", pageimage: "Palermo.jpg", at: [38.1157, 13.3615] }, { title: "Teatro Massimo Vittorio Emanuele", pageimage: "Massimo.jpg", at: [38.1202, 13.3572] }),
      search: search({ title: "Teatro alla Scala", pageimage: "Scala.jpg", at: [45.4674, 9.1895] }),
      files: { "Massimo.jpg": cc0("Massimo.jpg"), "Scala.jpg": cc0("Scala.jpg"), "Palermo.jpg": cc0("Palermo.jpg") },
    });
    expect(await findWikipediaPhoto({ name: "Visita al Teatro Massimo", ...PALERMO }, new Set(), { transport: teatro.transport, sleep: noSleep })).toMatchObject({
      ok: true,
      article: "Teatro Massimo Vittorio Emanuele",
    });

    const far = fakeWiki({
      exact: search({ title: "Teatro Massimo", pageimage: "Pescara.jpg", at: [42.46, 14.21] }),
      files: { "Pescara.jpg": cc0("Pescara.jpg") },
      search: {},
    });
    expect(await findWikipediaPhoto({ name: "Teatro Massimo", ...PALERMO }, new Set(), { transport: far.transport, sleep: noSleep })).toEqual({
      ok: false,
      reason: "no_article",
    });
  });

  it("licenze multiple dalle categorie, codici con suffisso, autore dal campo Credit", async () => {
    const gfdl = fakeWiki({
      search: search({ title: "Catania", pageimage: "Catania.jpg" }),
      files: { "Catania.jpg": commonsFile("Catania.jpg", { license: "gfdl", short: "GFDL", categories: ["GFDL", "CC-BY-SA-3.0-migrated", "CC-BY-SA-3.0"] }) },
    });
    expect(await findWikipediaPhoto({ name: "Catania" }, new Set(), { allowSa: true, transport: gfdl.transport, sleep: noSleep })).toMatchObject({
      ok: true,
      file: { license: "CC BY-SA 3.0" },
    });
    const migrated = fakeWiki({
      search: search({ title: "Erice", pageimage: "Erice.jpg" }),
      files: { "Erice.jpg": commonsFile("Erice.jpg", { license: "cc-by-sa-3.0-migrated", short: "CC BY-SA 3.0", author: null, credit: "Mario Rossi" }) },
    });
    expect(await findWikipediaPhoto({ name: "Erice" }, new Set(), { allowSa: true, transport: migrated.transport, sleep: noSleep })).toMatchObject({
      ok: true,
      file: { license: "CC BY-SA 3.0", author: "Mario Rossi" },
    });
    const ownWork = fakeWiki({
      search: search({ title: "Enna", pageimage: "Enna.jpg" }),
      files: { "Enna.jpg": commonsFile("Enna.jpg", { license: "cc0", author: null, credit: "Opera propria" }) },
    });
    expect(await findWikipediaPhoto({ name: "Enna" }, new Set(), { transport: ownWork.transport, sleep: noSleep })).toMatchObject({
      ok: false,
      detail: "autore mancante",
    });
  });

  it("un rifiuto di Wikimedia diventa network con il codice HTTP", async () => {
    expect(await findWikipediaPhoto({ name: "Noto" }, new Set(), { transport: fakeWiki({ search: {}, fail: 403 }).transport, sleep: noSleep })).toEqual({
      ok: false,
      reason: "network",
      detail: "403",
    });
  });
});
