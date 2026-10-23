import { describe, expect, it } from "vitest";
import { coverCrop } from "./og-crop";

describe("coverCrop", () => {
  it("una foto 4:5 su una scatola 1080x1920 scala sull'altezza e centra sul punto focale", () => {
    const crop = coverCrop({ width: 1600, height: 2000 }, { width: 1080, height: 1920 }, { x: 0.5, y: 0.5 });
    expect(crop.resize).toEqual({ width: 1536, height: 1920 });
    expect(crop.extract).toEqual({ left: 228, top: 0, width: 1080, height: 1920 });
  });

  it("il punto focale spinge la finestra senza uscire dai bordi", () => {
    const left = coverCrop({ width: 1600, height: 2000 }, { width: 1080, height: 1920 }, { x: 0, y: 0 });
    expect(left.extract.left).toBe(0);
    const right = coverCrop({ width: 1600, height: 2000 }, { width: 1080, height: 1920 }, { x: 1, y: 1 });
    expect(right.extract.left).toBe(1536 - 1080);
  });

  it("l'immagine copre sempre la scatola, anche con proporzioni diverse", () => {
    const crop = coverCrop({ width: 640, height: 900 }, { width: 1200, height: 630 }, { x: 0.3, y: 0.7 });
    expect(crop.resize.width).toBeGreaterThanOrEqual(1200);
    expect(crop.resize.height).toBeGreaterThanOrEqual(630);
    expect(crop.extract.left + crop.extract.width).toBeLessThanOrEqual(crop.resize.width);
    expect(crop.extract.top + crop.extract.height).toBeLessThanOrEqual(crop.resize.height);
  });
});
