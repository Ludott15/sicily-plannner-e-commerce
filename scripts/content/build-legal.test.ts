import { describe, expect, it } from "vitest";
import { LEGAL_VARIABLES } from "../../src/lib/legal-text";
import { KNOWN_VARIABLES, parseLegalSource, renderLegalModule } from "./build-legal.mjs";

const header = "---\nupdated: 2026-10-18\nversion: 1\n---\n";

describe("parseLegalSource", () => {
  it("legge data e versione e tiene il corpo con un solo a capo finale", () => {
    const parsed = parseLegalSource(`${header}\nTesto con {{titolare}}.\n\n`, "privacy.it.md");
    expect(parsed).toEqual({ text: "Testo con {{titolare}}.\n", updatedAt: "2026-10-18", version: "1" });
  });

  it("rifiuta una data o una versione non valide e una variabile sconosciuta", () => {
    expect(() => parseLegalSource("---\nupdated: 18/10/2026\nversion: 1\n---\nx", "a.it.md")).toThrow("AAAA-MM-GG");
    expect(() => parseLegalSource("---\nupdated: 2026-10-18\nversion: 0\n---\nx", "a.it.md")).toThrow("intero positivo");
    expect(() => parseLegalSource(`${header}Dato {{nome_sbagliato}}.`, "a.it.md")).toThrow("variabile sconosciuta");
  });
});

describe("renderLegalModule", () => {
  it("produce letterali TypeScript per ogni documento, ordinati per id", () => {
    const source = renderLegalModule({
      termini: { it: 'Dice "ciao" e \\ basta.\n', en: null, updatedAt: "2026-10-18", version: "1" },
      cookie: { it: "Cookie.\n", en: "Cookies.\n", updatedAt: "2026-10-18", version: "2" },
    });
    expect(source).toContain('export type LegalDocId = "cookie" | "termini";');
    expect(source.indexOf('"cookie": {')).toBeLessThan(source.indexOf('"termini": {'));
    expect(source).toContain('en: "Cookies.\\n",');
    expect(source).toContain("en: null,");
    expect(source).toContain('it: "Dice \\"ciao\\" e \\\\ basta.\\n",');
  });

  it("ha le stesse variabili di src/lib/legal-text.ts", () => {
    expect([...KNOWN_VARIABLES]).toEqual([...LEGAL_VARIABLES]);
  });
});
