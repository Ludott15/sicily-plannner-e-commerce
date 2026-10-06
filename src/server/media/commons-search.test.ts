import { describe, expect, it } from "vitest";
import type { CommonsFile } from "@/lib/media-admin";
import { keywords, rankCandidates, scoreCandidate, searchCommons, searchUrls, type SearchTarget } from "./commons-search";
import type { Transport } from "./safe-fetch";

type Page = ReturnType<typeof page>;

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
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(title)}/960px-x.jpg`,
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

// Risposta "leggera" (passo 1): solo misure e tipo, come con iiprop=size|mime.
const lite = (...pages: Page[]) => ({
  query: {
    pages: pages.map((p) => ({
      title: p.title,
      index: p.index,
      imageinfo: [{ width: p.imageinfo[0]!.width, height: p.imageinfo[0]!.height, mime: "image/jpeg" }],
    })),
  },
});

// API finta: generator=geosearch → geo, generator=search → text (filtrata e libera), titles=… →
// dettagli completi delle pagine richieste. Registra le richieste fatte.
function fakeApi(responses: { geo?: Page[]; text?: Page[]; partialDetails?: boolean; failures?: number[] }) {
  const all = new Map([...(responses.geo ?? []), ...(responses.text ?? [])].map((p) => [p.title, p]));
  const requests: URL[] = [];
  const failures = [...(responses.failures ?? [])];
  const transport: Transport = async (url) => {
    expect(url.host).toBe("commons.wikimedia.org");
    requests.push(url);
    const respond = (status: number, body: unknown) => ({
      status,
      header: (name: string) => (name === "content-type" ? "application/json; charset=utf-8" : null),
      body: (async function* () {
        yield new TextEncoder().encode(JSON.stringify(body));
      })(),
      cancel: () => {},
    });
    const failure = failures.shift();
    if (failure) return respond(failure, {});
    const generator = url.searchParams.get("generator");
    if (generator === "geosearch") return respond(200, lite(...(responses.geo ?? [])));
    if (generator === "search") return respond(200, lite(...(responses.text ?? [])));
    const titles = (url.searchParams.get("titles") ?? "").split("|");
    // Con partialDetails la prima risposta dei dettagli arriva senza imageinfo per metà dei file,
    // con "continue", come fa l'API vera quando i dati sono troppi.
    const continued = url.searchParams.has("iicontinue");
    const pages = titles.map((t, i) =>
      responses.partialDetails && !continued && i % 2 === 1 ? { title: t } : (all.get(t) ?? { title: t, missing: true }),
    );
    return respond(200, {
      query: { pages },
      ...(responses.partialDetails && !continued ? { continue: { iicontinue: "x", continue: "||" } } : {}),
    });
  };
  return { transport, requests };
}

const noSleep = async () => {};
const place: SearchTarget = { name: "Ortigia", query: "ortigia", lat: 37.06, lng: 15.29, requireNameMatch: false };
const activity: SearchTarget = { name: "Corso di cous cous trapanese", query: "cous trapanese", requireNameMatch: true };

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

describe("searchCommons", () => {
  it("passo 1 leggero, passo 2 dettagli solo dei file adatti; motivi di scarto contati", async () => {
    const api = fakeApi({
      geo: [
        page("Ortigia vista dal mare.jpg"),
        page("Ortigia SA.jpg", { license: "cc-by-sa-4.0" }),
        page("Ortigia senza autore.jpg", { author: null }),
        page("Ortigia ritratto.jpg", { restrictions: "personality" }),
        page("Mappa di Ortigia.jpg"),
        page("Ortigia piccola.jpg", { width: 1200, height: 900 }),
      ],
    });
    const result = await searchCommons(place, new Set(), api.transport, { sleep: noSleep });
    expect(result.ok && result.candidates.map((c) => c.title)).toEqual(["File:Ortigia vista dal mare.jpg"]);
    expect(result.ok && result.stats).toEqual({ found: 6, license: 1, small: 1, other: 0, unfit: 3 });
    // Tre interrogazioni leggere (posizione, nome filtrato, nome libero) più una di dettagli
    // per i soli quattro file rimasti dopo misure e titolo.
    expect(api.requests.map((u) => u.searchParams.get("iiprop"))).toEqual(["size|mime", "size|mime", "size|mime", "url|size|mime|extmetadata"]);
    expect(api.requests[3]!.searchParams.get("titles")!.split("|")).toHaveLength(4);
  });

  it("CC BY-SA solo con allowSa", async () => {
    const geo = [page("Ortigia SA.jpg", { license: "cc-by-sa-4.0" })];
    const without = await searchCommons(place, new Set(), fakeApi({ geo }).transport, { sleep: noSleep });
    expect(without.ok && without.candidates).toEqual([]);
    const withSa = await searchCommons(place, new Set(), fakeApi({ geo }).transport, { sleep: noSleep, allowSa: true });
    expect(withSa.ok && withSa.candidates.map((c) => [c.title, c.license])).toEqual([["File:Ortigia SA.jpg", "CC BY-SA 4.0"]]);
  });

  it("segue le continuazioni dell'API quando i dettagli arrivano a rate", async () => {
    const api = fakeApi({ geo: [page("Ortigia uno.jpg"), page("Ortigia due.jpg"), page("Ortigia tre.jpg")], partialDetails: true });
    const result = await searchCommons(place, new Set(), api.transport, { sleep: noSleep });
    expect(result.ok && result.candidates.map((c) => c.title).sort()).toEqual([
      "File:Ortigia due.jpg",
      "File:Ortigia tre.jpg",
      "File:Ortigia uno.jpg",
    ]);
    expect(result.ok && result.stats.other).toBe(0);
  });

  it("con 429 aspetta e riprova; dopo troppi rifiuti restituisce il codice HTTP", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    const retried = await searchCommons(place, new Set(), fakeApi({ geo: [page("Ortigia.jpg")], failures: [429, 503] }).transport, { sleep });
    expect(retried.ok && retried.candidates).toHaveLength(1);
    expect(waits).toEqual([2_000, 5_000]);

    const blocked = await searchCommons(place, new Set(), fakeApi({ failures: [429, 429, 429, 429] }).transport, { sleep: noSleep });
    expect(blocked).toEqual({ ok: false, error: "fetch_bad_status", detail: "429" });
    const forbidden = await searchCommons(place, new Set(), fakeApi({ failures: [403] }).transport, { sleep: noSleep });
    expect(forbidden).toEqual({ ok: false, error: "fetch_bad_status", detail: "403" });
  });

  it("per i luoghi accetta foto vicine anche senza il nome; per le attività serve metà delle parole chiave", async () => {
    const geoOnly = await searchCommons(place, new Set(), fakeApi({ geo: [page("IMG_2041.jpg")] }).transport, { sleep: noSleep });
    expect(geoOnly.ok && geoOnly.candidates.map((c) => c.title)).toEqual(["File:IMG_2041.jpg"]);

    const act = await searchCommons(
      activity,
      new Set(),
      fakeApi({ text: [page("Cous cous trapanese di pesce.jpg"), page("Trapani porto.jpg"), page("IMG_9.jpg", { description: "couscous" })] })
        .transport,
      { sleep: noSleep },
    );
    // Parole chiave "cous" e "trapanese" (anche come inizio di parola: "couscous"); "Trapani
    // porto" non ne ha nessuna. Prima la foto che le ha entrambe.
    expect(act.ok && act.candidates.map((c) => c.title)).toEqual(["File:Cous cous trapanese di pesce.jpg", "File:IMG_9.jpg"]);
  });
});

describe("rankCandidates", () => {
  it("ordina per pertinenza, premia i file trovati sia per posizione sia per nome, salta quelli già importati", () => {
    const parsed = (title: string): CommonsFile => ({
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
    const origin = new Map([
      ["File:Ortigia duomo.jpg", { geo: true, text: true }],
      ["File:Ortigia gia usata.jpg", { geo: true, text: false }],
      ["File:Strada.jpg", { geo: true, text: false }],
      ["File:Ortigia fonte Aretusa.jpg", { geo: false, text: true }],
    ]);
    const ranked = rankCandidates(
      [parsed("Ortigia duomo.jpg"), parsed("Ortigia gia usata.jpg"), parsed("Strada.jpg"), parsed("Ortigia fonte Aretusa.jpg")],
      origin,
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
      ["commons.wikimedia.org", false],
    ]);
    expect(new URL(urls[0]!.url).searchParams.get("ggscoord")).toBe("36.89|15.07");
    // Prima la ricerca filtrata sulle licenze ammesse (dati strutturati), poi quella libera.
    const filtered = new URL(urls[1]!.url).searchParams.get("gsrsearch")!;
    expect(filtered).toMatch(/^noto filetype:bitmap haswbstatement:P275=Q6938433\|/);
    expect(filtered).not.toContain("Q18199165");
    expect(new URL(urls[2]!.url).searchParams.get("gsrsearch")).toBe("noto filetype:bitmap");
    const withSa = searchUrls({ name: "Noto", query: "noto", requireNameMatch: false }, { allowSa: true });
    expect(new URL(withSa[0]!.url).searchParams.get("gsrsearch")).toContain("P275=Q18199165");
    expect(searchUrls({ name: "Ovest", query: "ovest Sicilia", requireNameMatch: true })).toHaveLength(2);
  });
});
