import { describe, expect, it } from "vitest";
import { newSubid, partnerName } from "./links";

describe("newSubid", () => {
  it("16 caratteri minuscoli e cifre, diversi a ogni chiamata", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newSubid()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{16}$/);
  });
});

describe("partnerName", () => {
  it("nomina i partner reali e nessuno per i contenuti interni", () => {
    expect(partnerName("getyourguide")).toBe("GetYourGuide");
    expect(partnerName("internal")).toBeNull();
  });
});
