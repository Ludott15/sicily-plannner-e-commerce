import { describe, expect, it } from "vitest";
import {
  groupSearchRows,
  isSearchKind,
  normalizeSearchQuery,
  searchHref,
  type SearchRow,
} from "./model";

describe("normalizeSearchQuery", () => {
  it("compatta gli spazi e toglie quelli ai bordi, senza cambiare maiuscole e accenti", () => {
    expect(normalizeSearchQuery("  Cefalù   di  mare ")).toBe("Cefalù di mare");
  });

  it("sotto 2 caratteri non c'è ricerca", () => {
    expect(normalizeSearchQuery("a")).toBe("");
    expect(normalizeSearchQuery("   ")).toBe("");
    expect(normalizeSearchQuery("")).toBe("");
  });

  it("al massimo 100 caratteri, contati come code point", () => {
    const long = "è".repeat(150);
    expect(Array.from(normalizeSearchQuery(long))).toHaveLength(100);
    expect(normalizeSearchQuery("ab".repeat(60)).length).toBe(100);
  });

  it("riporta a 100 caratteri senza lasciare spazi in coda", () => {
    const text = `${"a".repeat(99)} b`;
    expect(normalizeSearchQuery(text)).toBe("a".repeat(99));
  });
});

describe("searchHref", () => {
  it("costruisce i percorsi pubblici senza prefisso di lingua", () => {
    expect(searchHref("place", "demo-palermo")).toBe("/luoghi/demo-palermo");
    expect(searchHref("activity", "demo-duomo-cefalu")).toBe("/attivita/demo-duomo-cefalu");
    expect(searchHref("itinerary", "demo-weekend-palermo")).toBe("/itinerari/demo-weekend-palermo");
    expect(searchHref("guide", "guida-palermo")).toBe("/guide/guida-palermo");
  });

  it("i prodotti non hanno ancora una pagina pubblica", () => {
    expect(searchHref("product", "crema")).toBeNull();
  });
});

describe("isSearchKind", () => {
  it("accetta solo i tipi noti", () => {
    expect(isSearchKind("place")).toBe(true);
    expect(isSearchKind("event")).toBe(false);
  });
});

describe("groupSearchRows", () => {
  const rows: SearchRow[] = [
    { kind: "guide", slug: "guida-1", title: "Guida", subtitle: "Autore" },
    { kind: "activity", slug: "a-1", title: "Attività 1", subtitle: "Cefalù" },
    { kind: "place", slug: "p-1", title: "Cefalù", subtitle: "PA" },
    { kind: "activity", slug: "a-2", title: "Attività 2", subtitle: "Cefalù" },
    { kind: "activity", slug: "a-3", title: "Attività 3", subtitle: "Cefalù" },
    { kind: "activity", slug: "a-4", title: "Attività 4", subtitle: "Cefalù" },
    { kind: "product", slug: "crema", title: "Crema", subtitle: null },
  ];

  it("raggruppa nell'ordine place, activity, itinerary, guide, product e salta i gruppi vuoti", () => {
    const result = groupSearchRows("cefalu", rows, 3);
    expect(result.query).toBe("cefalu");
    expect(result.groups.map((group) => group.kind)).toEqual(["place", "activity", "guide"]);
  });

  it("limita i risultati per tipo e conta il totale", () => {
    const result = groupSearchRows("cefalu", rows, 2);
    const activities = result.groups.find((group) => group.kind === "activity");
    expect(activities?.hits.map((hit) => hit.slug)).toEqual(["a-1", "a-2"]);
    expect(result.total).toBe(4);
  });

  it("scarta i prodotti (nessun href) e mantiene il link di ogni risultato", () => {
    const result = groupSearchRows("cefalu", rows, 5);
    expect(result.groups.some((group) => group.kind === "product")).toBe(false);
    const place = result.groups.find((group) => group.kind === "place")?.hits[0];
    expect(place).toEqual({ kind: "place", slug: "p-1", title: "Cefalù", subtitle: "PA", href: "/luoghi/p-1" });
  });

  it("con query vuota non restituisce gruppi", () => {
    expect(groupSearchRows("", rows, 3)).toEqual({ query: "", total: 0, groups: [] });
  });
});
