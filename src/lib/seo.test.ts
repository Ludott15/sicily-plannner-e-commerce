import { describe, expect, it } from "vitest";
import { canonicalFor, jsonLd, localizedAlternates, localizedPath, truncate } from "./seo";

describe("localizedAlternates", () => {
  it("canonical nella lingua corrente e hreflang per tutte", () => {
    expect(localizedAlternates("en", "/attivita/demo-x")).toEqual({
      canonical: "/en/attivita/demo-x",
      languages: { it: "/it/attivita/demo-x", en: "/en/attivita/demo-x", "x-default": "/it/attivita/demo-x" },
    });
  });
});

describe("canonicalFor", () => {
  it("toglie la query dal canonical: le pagine filtrate indicano la versione senza filtri", () => {
    expect(canonicalFor("it", "/attivita?interessi=mare&provincia=PA")).toEqual({
      canonical: "/it/attivita",
      languages: { it: "/it/attivita", en: "/en/attivita", "x-default": "/it/attivita" },
    });
  });

  it("toglie anche il frammento e lo slash finale", () => {
    expect(canonicalFor("en", "/itinerari/demo-x#giorni").canonical).toBe("/en/itinerari/demo-x");
    expect(canonicalFor("en", "/itinerari/demo-x/").canonical).toBe("/en/itinerari/demo-x");
  });

  it("la home è la sola lingua senza percorso", () => {
    expect(canonicalFor("en", "/")).toEqual({
      canonical: "/en",
      languages: { it: "/it", en: "/en", "x-default": "/it" },
    });
    expect(canonicalFor("it", "").canonical).toBe("/it");
  });

  it("una lingua sconosciuta cade su quella predefinita", () => {
    expect(canonicalFor("fr", "/guide").canonical).toBe("/it/guide");
  });

  it("localizedPath costruisce il percorso di una lingua", () => {
    expect(localizedPath("en", "/sicilia/palermo")).toBe("/en/sicilia/palermo");
  });
});

describe("truncate", () => {
  it("lascia i testi brevi e taglia quelli lunghi con i puntini", () => {
    expect(truncate("  breve  ")).toBe("breve");
    expect(truncate("a".repeat(200), 10)).toBe(`${"a".repeat(9)}…`);
    expect(truncate(null)).toBeUndefined();
  });
});

describe("jsonLd", () => {
  it("non permette di chiudere il tag script", () => {
    expect(jsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});
