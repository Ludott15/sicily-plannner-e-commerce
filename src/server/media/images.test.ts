import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { blurDataUrl, cleanMaster, inspectPhoto, inspectSvg, renderVariants } from "./images";

const photo = (width: number, height: number, format: "jpeg" | "png" | "webp" = "jpeg") =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 80 } } })
    .toFormat(format)
    .toBuffer();

// JPEG con EXIF, GPS compreso, e orientamento ruotato (6 = 90° in senso orario).
const photoWithGps = async () =>
  sharp(await photo(2000, 1200))
    .withExif({
      IFD0: { Make: "Fotocamera", Model: "Prova", Artist: "Qualcuno" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 3/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "15/1 17/1 0/1" },
    })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

describe("inspectPhoto", () => {
  it("accetta JPEG, PNG e WebP con lato lungo di almeno 1600 px", async () => {
    for (const format of ["jpeg", "png", "webp"] as const) {
      const result = await inspectPhoto(await photo(1600, 900, format));
      expect(result).toMatchObject({ ok: true, photo: { format, width: 1600, height: 900 } });
    }
  });
  it("rifiuta lato lungo sotto 1600 px con le misure", async () => {
    expect(await inspectPhoto(await photo(1599, 1000))).toEqual({
      ok: false,
      error: { code: "too_small", width: 1599, height: 1000 },
    });
  });
  it("rifiuta i file oltre 10 MB prima di leggerli", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);
    expect(await inspectPhoto(big)).toEqual({ ok: false, error: { code: "too_large", bytes: big.byteLength } });
  });
  it("rifiuta tipi non ammessi guardando il contenuto, non l'estensione", async () => {
    const gif = await sharp({ create: { width: 1700, height: 1700, channels: 3, background: "white" } }).gif().toBuffer();
    expect(await inspectPhoto(gif)).toEqual({ ok: false, error: { code: "unsupported_type", format: "gif" } });
    expect(await inspectPhoto(Buffer.from("<html>non un'immagine</html>"))).toEqual({ ok: false, error: { code: "unreadable" } });
  });
  it("considera l'orientamento EXIF per il lato lungo", async () => {
    const rotated = await sharp(await photo(1700, 1000)).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect(await inspectPhoto(rotated)).toMatchObject({ ok: true, photo: { width: 1000, height: 1700 } });
  });
});

describe("cleanMaster", () => {
  it("rimuove EXIF e GPS e applica l'orientamento", async () => {
    const input = await photoWithGps();
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();
    expect(before.orientation).toBe(6);

    const { buffer, width, height } = await cleanMaster(input, "jpeg");
    const after = await sharp(buffer).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    expect(buffer.includes(Buffer.from("GPS"))).toBe(false);
    expect(buffer.includes(Buffer.from("Fotocamera"))).toBe(false);
    expect([width, height]).toEqual([1200, 2000]);
  });
});

describe("renderVariants", () => {
  it("genera AVIF e WebP per 4:5, 16:9 e 1:1 alle larghezze previste", async () => {
    const master = await photo(2000, 1600);
    const variants = await renderVariants(master, 2000, 1600, 0.3, 0.6);
    const keys = variants.map((v) => `${v.ratio}-${v.width}.${v.format}`).sort();
    expect(keys).toEqual(
      [
        ...["480", "800", "1200"].map((w) => `4x5-${w}`),
        ...["480", "800", "1200", "1600"].map((w) => `16x9-${w}`),
        ...["480", "800", "1200", "1600"].map((w) => `1x1-${w}`),
      ]
        .flatMap((k) => [`${k}.avif`, `${k}.webp`])
        .sort(),
    );
    const sample = variants.find((v) => v.ratio === "16x9" && v.width === 800 && v.format === "webp")!;
    const meta = await sharp(sample.buffer).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 800, 450]);
    const avif = variants.find((v) => v.format === "avif")!;
    expect((await sharp(avif.buffer).metadata()).format).toBe("heif");
  }, 60_000);

  it("segnaposto sfocato come data URL WebP", async () => {
    expect(await blurDataUrl(await photo(1600, 1000))).toMatch(/^data:image\/webp;base64,/);
  });
});

describe("inspectSvg", () => {
  const svg = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">${body}</svg>`);

  it("accetta un SVG statico", async () => {
    expect(await inspectSvg(svg('<rect width="10" height="10" fill="currentColor"/>'))).toEqual({ ok: true, width: 1600, height: 1000 });
  });
  it("rifiuta script, eventi, contenuti esterni ed entità", async () => {
    const cases: Array<[string, string]> = [
      ["<script>alert(1)</script>", "script"],
      ['<rect onload="alert(1)"/>', "event_handler"],
      ['<a href="javascript:alert(1)"><text>x</text></a>', "javascript_url"],
      ["<foreignObject><div/></foreignObject>", "foreign_object"],
      ['<image href="https://esempio.it/x.png"/>', "external_reference"],
      ['<iframe src="x"></iframe>', "embedded_content"],
      ['<rect style="fill:url(https://esempio.it/x)"/>', "external_reference"],
    ];
    for (const [body, reason] of cases) {
      expect(await inspectSvg(svg(body))).toEqual({ ok: false, error: { code: "unsafe_svg", reason } });
    }
  });
  it("rifiuta file che non sono SVG", async () => {
    expect(await inspectSvg(Buffer.from("<html><svg></svg></html>"))).toMatchObject({ ok: false, error: { code: "unsupported_type" } });
  });
});
