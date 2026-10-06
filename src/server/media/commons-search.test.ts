import { describe, expect, it } from "vitest";
import { keywords, rankCandidates, scoreCandidate, searchCommons, searchUrls, type SearchTarget } from "./commons-search";
import type { Transport } from "./safe-fetch";

const page = (
  title: string,
  opts: { license?: string; author?: string | null; description?: string; width?: number; height?: number; restrictions?: string; index?: number } = {},
) => ({
  title: `File:${title}`,
  index: opts.index ?? 1,
  imageinfo: [
    {
      width: opts.width ?? 4000,
      height: opts.height ?? 3000,
      mime: "image/jpeg",
      url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${encodeURIComponent(title)}`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(title)}/640px-x.jpg`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`,
      extmetadata: {
        License: { value: opts.license ?? "cc-by-4.0" },
        LicenseShortName: { value: opts.license === "cc-by-sa-4.0" ? "CC BY-SA 4.0" : "CC BY 4.0" },
        ...(opts.author === null ? {} : { Artist: { value: opts.author ?? "Fotografo" } }),
        ImageDescription: { value: opts.description ?? "" },
        ...(opts.restrictions ? { Restrictions: { value: opts.restrictions } } : {}),
      },
    },
  ],
});

const files = (...pages: ReturnType<typeof page>[]) => ({ query: { pages } });

describe("parole chiave e pertinenza", () => {
  it("toglie accenti, articoli, parole da itinerario e il prefisso demo", () => {
    expect(keywords("[DEMO] Escursione ai crateri sommitali dell'Etna")).toEqual(["crateri", "sommitali", "dell", "etna"]);
    expect(keywords("Cefalù")).toEqual(["cefalu"]);
    expect(keywords("Weekend a Palermo e dintorni")).toEqual(["palermo", "dintorni"]);
  });
  it("conta le parole chiave nel titolo e nella descrizione e premia la vicinanza", () => {
    const words = keywords("Valle dei Templi");
    expect(scoreCandidate({ title: "File:Valle dei Templi Agrigento.jpg", description: null, width: 4000, height: 3000 }, words, false)).toEqual({
      score: 11,
      matched: ["valle", "templi"],
    });
    expect(scoreCandidate({ title: "File:IMG_1234.jpg", description: "Tempio della Concordia, Valle", width: 3000, height: 4000 }, words, true).score).toBe(8);
  });
});

describe("rankCandidates", () => {
  const place: SearchTarget = { name: "Ortigia", query: "ortigia", lat: 37.06, lng: 15.29, requireNameMatch: false };
  const activity: SearchTarget = { name: "Corso di cous cous trapanese", query: "cous trapanese", requireNameMatch: true };

  it("scarta licenze non ammesse, autori mancanti, persone riconoscibili, mappe e stemmi", async () => {
    const transport = fakeApi({
      geo: files(
        page("Ortigia vista dal mare.jpg"),
        page("Ortigia SA.jpg", { license: "cc-by-sa-4.0" }),
        page("Ortigia senza autore.jpg", { author: null }),
        page("Ortigia ritratto.jpg", { restrictions: "personality" }),
        page("Mappa di Ortigia.jpg"),
        page("Stemma Siracusa.jpg"),
        page("Ortigia piccola.jpg", { width: 1200, height: 900 }),
      ),
      text: files(),
    });
    const result = await searchCommons(place, new Set(), transport);
    expect(result.ok && result.candidates.map((c) => c.title)).toEqual(["File:Ortigia vista dal mare.jpg"]);
  });

  it("per i luoghi accetta foto vicine anche senza il nome; per le attività serve metà delle parole chiave", async () => {
    const geoOnly = await searchCommons(place, new Set(), fakeApi({ geo: files(page("IMG_2041.jpg")), text: files() }));
    expect(geoOnly.ok && geoOnly.candidates.map((c) => c.title)).toEqual(["File:IMG_2041.jpg"]);

    const act = await searchCommons(
      activity,
      new Set(),
      fakeApi({
        text: files(
          page("Cous cous trapanese di pesce.jpg"),
          page("Trapani porto.jpg"),
          page("IMG_9.jpg", { description: "couscous" }),
        ),
      }),
    );
    // Parole chiave "cous" e "trapanese" (anche come inizio di parola: "couscous"); "Trapani
    // porto" non ne ha nessuna. Prima la foto che le ha entrambe.
    expect(act.ok && act.candidates.map((c) => c.title)).toEqual(["File:Cous cous trapanese di pesce.jpg", "File:IMG_9.jpg"]);
  });

  it("ordina per pertinenza, premia i file trovati sia per posizione sia per nome, salta quelli già importati", () => {
    const parsed = (title: string) => ({
      title: `File:${title}`,
      pageUrl: `https://commons.wikimedia.org/wiki/File:${title}`,
      downloadUrl: `https://upload.wikimedia.org/x/${title}`,
      width: 4000,
      height: 3000,
      mime: "image/jpeg",
      author: "A",
      authorUrl: null,
      license: "CC0 1.0",
      licenseUrl: null,
      description: null,
      warnings: [],
    });
    const ranked = rankCandidates(
      [
        { files: [parsed("Ortigia duomo.jpg"), parsed("Ortigia gia usata.jpg"), parsed("Strada.jpg")], geo: true },
        { files: [parsed("Ortigia duomo.jpg"), parsed("Ortigia fonte Aretusa.jpg")], geo: false },
      ],
      place,
      new Set(["https://commons.wikimedia.org/wiki/File:Ortigia gia usata.jpg"]),
    );
    expect(ranked.map((c) => [c.title, c.score])).toEqual([
      ["File:Ortigia duomo.jpg", 16],
      ["File:Ortigia fonte Aretusa.jpg", 11],
      ["File:Strada.jpg", 4],
    ]);
  });
});

describe("searchUrls", () => {
  it("interroga solo l'API di commons.wikimedia.org, per posizione se ci sono le coordinate", () => {
    const urls = searchUrls({ name: "Noto", query: "noto", lat: 36.89, lng: 15.07, requireNameMatch: false });
    expect(urls.map((u) => [new URL(u.url).host, u.geo])).toEqual([
      ["commons.wikimedia.org", true],
      ["commons.wikimedia.org", false],
    ]);
    expect(new URL(urls[0]!.url).searchParams.get("ggscoord")).toBe("36.89|15.07");
    expect(new URL(urls[1]!.url).searchParams.get("gsrsearch")).toBe("noto filetype:bitmap");
    expect(searchUrls({ name: "Ovest", query: "ovest Sicilia", requireNameMatch: true })).toHaveLength(1);
  });

  it("un errore di rete diventa un codice, senza eccezioni", async () => {
    const failing: Transport = async () => ({ status: 503, header: () => null, body: (async function* () {})(), cancel: () => {} });
    expect(await searchCommons({ name: "Noto", query: "noto", requireNameMatch: false }, new Set(), failing)).toEqual({
      ok: false,
      error: "fetch_bad_status",
    });
  });
});

// API finta: risponde "geo" alle richieste con generator=geosearch e "text" a quelle per nome.
function fakeApi(responses: { geo?: unknown; text?: unknown }): Transport {
  return async (url) => {
    expect(url.host).toBe("commons.wikimedia.org");
    const body = url.searchParams.get("generator") === "geosearch" ? responses.geo : responses.text;
    const json = JSON.stringify(body ?? { query: { pages: [] } });
    return {
      status: 200,
      header: (name) => (name === "content-type" ? "application/json; charset=utf-8" : null),
      body: (async function* () {
        yield new TextEncoder().encode(json);
      })(),
      cancel: () => {},
    };
  };
}
