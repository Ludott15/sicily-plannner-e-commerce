import { describe, expect, it } from "vitest";
import { SEARCH_MIN_LENGTH, flattenOptions, isSearchGroups, searchPageHref, shouldSearch } from "@/components/search/search-model";
import type { SearchGroups } from "@/server/search/queries";

const groups: SearchGroups = {
  query: "palermo",
  total: 3,
  groups: [
    {
      kind: "place",
      hits: [{ kind: "place", slug: "demo-palermo", title: "Palermo", subtitle: "PA", href: "/luoghi/demo-palermo" }],
    },
    {
      kind: "activity",
      hits: [
        {
          kind: "activity",
          slug: "demo-teatro-massimo",
          title: "Visita al Teatro Massimo",
          subtitle: "Palermo",
          href: "/attivita/demo-teatro-massimo",
        },
        {
          kind: "activity",
          slug: "demo-palazzo-normanni",
          title: "Palazzo dei Normanni",
          subtitle: null,
          href: "/attivita/demo-palazzo-normanni",
        },
      ],
    },
  ],
};

describe("shouldSearch", () => {
  it("cerca da due caratteri, senza contare gli spazi ai bordi", () => {
    expect(shouldSearch("p")).toBe(false);
    expect(shouldSearch("  p ")).toBe(false);
    expect(shouldSearch(" pa ")).toBe(true);
    expect(SEARCH_MIN_LENGTH).toBe(2);
  });
});

describe("flattenOptions", () => {
  it("mantiene l'ordine dei gruppi, una voce dopo l'altra per le frecce", () => {
    expect(flattenOptions(groups).map((hit) => hit.slug)).toEqual([
      "demo-palermo",
      "demo-teatro-massimo",
      "demo-palazzo-normanni",
    ]);
  });
});

describe("searchPageHref", () => {
  it("codifica la query senza prefisso di lingua e senza spazi ai bordi", () => {
    expect(searchPageHref("  caffè & cannoli ")).toBe("/cerca?q=caff%C3%A8%20%26%20cannoli");
  });
});

describe("isSearchGroups", () => {
  it("accetta la risposta del contratto", () => {
    expect(isSearchGroups(groups)).toBe(true);
    expect(isSearchGroups(JSON.parse(JSON.stringify(groups)))).toBe(true);
  });

  it("rifiuta forme non valide invece di mostrarle", () => {
    expect(isSearchGroups(null)).toBe(false);
    expect(isSearchGroups({ query: "x", total: 0 })).toBe(false);
    expect(isSearchGroups({ query: "x", total: 1, groups: [{ kind: "museo", hits: [] }] })).toBe(false);
    expect(
      isSearchGroups({
        query: "x",
        total: 1,
        groups: [{ kind: "place", hits: [{ kind: "place", slug: "a", title: 1, subtitle: null, href: "/luoghi/a" }] }],
      }),
    ).toBe(false);
  });
});
