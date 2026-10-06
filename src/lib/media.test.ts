import { describe, expect, it } from "vitest";
import {
  activityCoverChain,
  cropRect,
  isServablePath,
  itineraryCoverChain,
  parseUploadName,
  pickVariantWidth,
  placeCoverChain,
  variantPath,
  variantWidths,
  type CoverMedia,
} from "./media";

const media = (id: string, kind: CoverMedia["kind"] = "photo"): CoverMedia => ({
  id,
  storagePath: `${id}/master.jpg`,
  width: 2000,
  height: 1500,
  focalX: 0.5,
  focalY: 0.5,
  altIt: "alt",
  altEn: null,
  kind,
  author: "A",
  authorUrl: null,
  license: "CC0",
  licenseUrl: null,
  modified: false,
  blurDataUrl: null,
  variantsVersion: 1,
});

describe("cropRect", () => {
  it("ritaglia 4:5 da una foto orizzontale centrata sul punto focale", () => {
    expect(cropRect(2000, 1500, "4x5", 0.5, 0.5)).toEqual({ left: 400, top: 0, width: 1200, height: 1500 });
  });
  it("sposta il ritaglio verso il punto focale e lo tiene dentro l'immagine", () => {
    expect(cropRect(2000, 1500, "4x5", 0.1, 0.5).left).toBe(0);
    expect(cropRect(2000, 1500, "4x5", 0.95, 0.5).left).toBe(800);
    expect(cropRect(2000, 1500, "4x5", 0.7, 0.5).left).toBe(800);
    expect(cropRect(2000, 1500, "4x5", 0.6, 0.5).left).toBe(600);
  });
  it("16:9 da una foto verticale usa tutta la larghezza", () => {
    const rect = cropRect(1200, 1800, "16x9", 0.5, 0.2);
    expect(rect).toEqual({ left: 0, top: 23, width: 1200, height: 675 });
  });
  it("1:1 resta dentro i bordi con punto focale agli estremi", () => {
    for (const [fx, fy] of [[0, 0], [1, 1], [0, 1], [1, 0]] as const) {
      const r = cropRect(1600, 2400, "1x1", fx, fy);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.left + r.width).toBeLessThanOrEqual(1600);
      expect(r.top + r.height).toBeLessThanOrEqual(2400);
      expect(r.width).toBe(1600);
    }
  });
});

describe("varianti", () => {
  it("larghezze non più grandi del ritaglio", () => {
    expect(variantWidths(1200)).toEqual([480, 800, 1200]);
    expect(variantWidths(1600)).toEqual([480, 800, 1200, 1600]);
  });
  it("il loader sceglie la variante più piccola sufficiente", () => {
    expect(pickVariantWidth(400)).toBe(480);
    expect(pickVariantWidth(801)).toBe(1200);
    expect(pickVariantWidth(3840)).toBe(1600);
    expect(pickVariantWidth(1000, [480, 800])).toBe(800);
  });
  it("percorsi serviti: solo varianti e illustrazioni", () => {
    const id = "0b3f8a6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
    expect(isServablePath(variantPath(id, 3, "16x9", 1200, "avif"))).toBe(true);
    expect(isServablePath(`${id}/illustration.svg`)).toBe(true);
    expect(isServablePath(`${id}/master.jpg`)).toBe(false);
    expect(isServablePath("incoming/abc.jpg")).toBe(false);
    expect(isServablePath(`${id}/v1/../master.jpg`)).toBe(false);
    expect(isServablePath(`${id}/v0/4x5-480.webp`)).toBe(false);
  });
});

describe("catena di ripiego", () => {
  const own = media("own");
  const place = media("place");
  const area = media("area", "illustration");

  it("attività: propria → luogo → area", () => {
    expect(activityCoverChain({ own, place, area })).toEqual({ media: own, source: "own" });
    expect(activityCoverChain({ own: null, place, area })).toEqual({ media: place, source: "place" });
    expect(activityCoverChain({ own: null, place: null, area })).toEqual({ media: area, source: "area" });
  });
  it("itinerario: propria → luogo della prima tappa → area", () => {
    expect(itineraryCoverChain({ own, firstStop: place, area })?.source).toBe("own");
    expect(itineraryCoverChain({ own: null, firstStop: place, area })).toEqual({ media: place, source: "first_stop" });
    expect(itineraryCoverChain({ firstStop: undefined, area })).toEqual({ media: area, source: "area" });
  });
  it("luogo: propria → area", () => {
    expect(placeCoverChain({ own, area })?.source).toBe("own");
    expect(placeCoverChain({ own: null, area })).toEqual({ media: area, source: "area" });
  });
  it("senza nessun anello restituisce null (segnaposto con il nome)", () => {
    expect(activityCoverChain({})).toBeNull();
    expect(itineraryCoverChain({ own: null, firstStop: null, area: null })).toBeNull();
  });
});

describe("parseUploadName", () => {
  it("riconosce slug-NN.ext", () => {
    expect(parseUploadName("ortigia-01.jpg")).toEqual({ slug: "ortigia", index: 1, ext: "jpg" });
    expect(parseUploadName("Valle-Dei-Templi-12.JPEG")).toEqual({ slug: "valle-dei-templi", index: 12, ext: "jpg" });
    expect(parseUploadName("etna-costa-ionica-01.svg")).toEqual({ slug: "etna-costa-ionica", index: 1, ext: "svg" });
  });
  it("rifiuta nomi senza numero o con estensioni non ammesse", () => {
    expect(parseUploadName("ortigia.jpg")).toBeNull();
    expect(parseUploadName("ortigia-1.jpg")).toBeNull();
    expect(parseUploadName("ortigia-01.gif")).toBeNull();
    expect(parseUploadName("../ortigia-01.jpg")).toBeNull();
  });
});
