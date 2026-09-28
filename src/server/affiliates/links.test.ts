import { describe, expect, it } from "vitest";
import { buildAffiliateUrl, newSubid, partnerName } from "./links";

describe("newSubid", () => {
  it("16 caratteri minuscoli e cifre, diversi a ogni chiamata", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newSubid()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{16}$/);
  });
});

describe("buildAffiliateUrl", () => {
  it("aggiunge il parametro del partner senza toccare l'URL di base", () => {
    const base = "https://www.getyourguide.com/s/?q=Zingaro&partner_id=ABC";
    const url = buildAffiliateUrl(base, "getyourguide", "abc123def456ghi7");
    expect(url).toBe(`${base}&cmp=abc123def456ghi7`);
    expect(url.startsWith(base)).toBe(true);
  });

  it("usa ? se l'URL non ha già parametri", () => {
    expect(buildAffiliateUrl("https://www.viator.com/tours/x", "viator", "s1")).toBe(
      "https://www.viator.com/tours/x?campaign=s1",
    );
  });

  it("per i contenuti interni e gli URL con frammento lascia l'URL com'è", () => {
    expect(buildAffiliateUrl("https://example.com/a", "internal", "s1")).toBe("https://example.com/a");
    expect(buildAffiliateUrl("https://example.com/a#b", "getyourguide", "s1")).toBe("https://example.com/a#b");
  });
});

describe("partnerName", () => {
  it("nomina i partner reali e nessuno per i contenuti interni", () => {
    expect(partnerName("getyourguide")).toBe("GetYourGuide");
    expect(partnerName("internal")).toBeNull();
  });
});
