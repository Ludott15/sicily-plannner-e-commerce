import { describe, expect, it } from "vitest";
import { splitFrontmatter } from "./frontmatter.mjs";

describe("splitFrontmatter", () => {
  it("legge valori semplici, liste di testi e liste di oggetti, e separa il corpo", () => {
    const source = [
      "---",
      "slug: palermo-in-tre-giorni",
      'title: "Palermo: tre giorni"',
      "summary: Una guida: cosa vedere.",
      "tags:",
      "  - mare",
      "  - arte",
      "links:",
      "  - place: palermo",
      "  - place: monreale",
      "---",
      "",
      "Corpo del testo.",
      "",
      "---",
      "Un'altra riga dopo la linea.",
    ].join("\n");
    const { data, body } = splitFrontmatter(source);
    expect(data).toEqual({
      slug: "palermo-in-tre-giorni",
      title: "Palermo: tre giorni",
      summary: "Una guida: cosa vedere.",
      tags: ["mare", "arte"],
      links: [{ place: "palermo" }, { place: "monreale" }],
    });
    expect(body).toBe("Corpo del testo.\n\n---\nUn'altra riga dopo la linea.");
  });

  it("gestisce i file senza intestazione e i CRLF", () => {
    expect(splitFrontmatter("solo testo\n")).toEqual({ data: {}, body: "solo testo\n" });
    const crlf = splitFrontmatter("---\r\nupdated: 2026-10-18\r\n---\r\nCorpo\r\n");
    expect(crlf.data).toEqual({ updated: "2026-10-18" });
    expect(crlf.body).toBe("Corpo\n");
  });

  it("rifiuta intestazioni non chiuse, chiavi ripetute e righe sconosciute", () => {
    expect(() => splitFrontmatter("---\nslug: a\n")).toThrow("non chiusa");
    expect(() => splitFrontmatter("---\nslug: a\nslug: b\n---\n")).toThrow("ripetuta");
    expect(() => splitFrontmatter("---\nriga senza due punti\n---\n")).toThrow("non riconosciuta");
  });

  it("rifiuta una lista che mescola testi e oggetti", () => {
    expect(() => splitFrontmatter("---\nlinks:\n  - palermo\n  - place: noto\n---\n")).toThrow("mescola");
  });
});
