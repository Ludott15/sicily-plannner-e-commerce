import { describe, expect, it } from "vitest";
import { jsonLd, localizedAlternates, truncate } from "./seo";

describe("localizedAlternates", () => {
  it("canonical nella lingua corrente e hreflang per tutte", () => {
    expect(localizedAlternates("en", "/attivita/demo-x")).toEqual({
      canonical: "/en/attivita/demo-x",
      languages: { it: "/it/attivita/demo-x", en: "/en/attivita/demo-x", "x-default": "/it/attivita/demo-x" },
    });
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
