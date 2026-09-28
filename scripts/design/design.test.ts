import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findViolations } from "./check-src.mjs";
import { generate, OUTPUT_DIR, TOKENS_PATH } from "./generate-tokens.mjs";

type ColorToken = { name: string; value: string | { light: string; dark: string } };
const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf8"));

describe("generatore dei token", () => {
  it("è deterministico: due esecuzioni danno gli stessi file", () => {
    expect(generate(structuredClone(tokens))).toEqual(generate(structuredClone(tokens)));
  });

  it("i file in generated/design sono aggiornati rispetto a tokens.json", () => {
    for (const [name, content] of Object.entries(generate(tokens))) {
      expect(readFileSync(`${OUTPUT_DIR}/${name}`, "utf8"), name).toBe(content);
    }
  });

  it("tema chiaro in :root, scuro in [data-theme=dark] e in prefers-color-scheme", () => {
    const css = generate(tokens)["tokens.css"];
    expect(css).toMatch(/:root,\n\[data-theme="light"\] \{[^}]*--calce: #f7f2ea;/);
    expect(css).toMatch(/\[data-theme="dark"\] \{[^}]*--calce: #171412;/);
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme="light"\]\) \{[^}]*--calce: #171412;/,
    );
  });

  it("gli alias {nome} diventano var(--nome)", () => {
    const css = generate(tokens)["tokens.css"];
    expect(css).toContain("--focus: var(--mare);");
    expect(css).toContain("--ink-edge: var(--ink);");
    expect(css).toContain("--ink-edge: var(--divider);");
    expect(css).not.toMatch(/\{[a-z-]+\}/);
  });

  it("ogni token di colore ha un valore in entrambi i temi", () => {
    const css = generate(tokens)["tokens.css"];
    for (const t of tokens.color.tokens as ColorToken[]) {
      expect(css.match(new RegExp(`--${t.name}: `, "g"))?.length, t.name).toBe(3);
    }
  });

  it("Tailwind legge le stesse variabili e azzera le tavolozze predefinite", () => {
    const theme = generate(tokens)["theme.css"];
    expect(theme).toContain("--color-*: initial;");
    expect(theme).toContain("--color-coccio-text: var(--coccio-text);");
    expect(theme).toContain("--spacing: var(--space-1);");
    expect(theme).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("titoli display: dimensione mobile di base e desktop da 768px", () => {
    const css = generate(tokens)["tokens.css"];
    expect(css).toContain("--type-display-xl-size: 44px;");
    expect(css).toMatch(/@media \(min-width: 768px\) \{[^}]*--type-display-xl-size: 72px;/);
  });

  it("font da next/font/google con le famiglie dei token e gli assi del manuale", () => {
    const fonts = generate(tokens)["fonts.ts"];
    expect(fonts).toContain('import { Fraunces, Instrument_Sans } from "next/font/google";');
    expect(fonts).toContain('axes: ["opsz", "SOFT"],');
  });
});

// Contrasti dichiarati in docs/design/brand/manuale.md, sezione Accessibilità.
function color(name: string, theme: "light" | "dark"): string {
  const token = (tokens.color.tokens as ColorToken[]).find((t) => t.name === name);
  if (!token) throw new Error(`token ${name} inesistente`);
  const v = typeof token.value === "string" ? token.value : token.value[theme];
  const alias = /^\{(.+)\}$/.exec(v)?.[1];
  return alias ? color(alias, theme) : v;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}

function contrast(fg: string, bg: string, theme: "light" | "dark"): number {
  const [a, b] = [luminance(color(fg, theme)), luminance(color(bg, theme))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const TINTS = ["coccio-tint", "mare-tint", "pistacchio-tint", "zagara-tint"];

describe("contrasti del manuale", () => {
  it.each(["light", "dark"] as const)("lava-muted su calce, calce-sunk e tinte almeno 5,7 (%s)", (theme) => {
    for (const bg of ["calce", "calce-sunk", ...TINTS]) {
      expect(contrast("lava-muted", bg, theme), bg).toBeGreaterThanOrEqual(5.7);
    }
  });

  it("lava-muted: almeno 5,9 su calce, calce-sunk e tinte tranne coccio-tint (chiaro)", () => {
    for (const bg of ["calce", "calce-sunk", "mare-tint", "pistacchio-tint", "zagara-tint"]) {
      expect(contrast("lava-muted", bg, "light"), bg).toBeGreaterThanOrEqual(5.9);
    }
    expect(contrast("lava-muted", "coccio-tint", "light")).toBeCloseTo(5.79, 2);
  });

  it("coccio-text su calce, calce-sunk e tutte le tinte almeno 5,8 (chiaro)", () => {
    for (const bg of ["calce", "calce-sunk", ...TINTS]) {
      expect(contrast("coccio-text", bg, "light"), bg).toBeGreaterThanOrEqual(5.8);
    }
  });

  it("coccio-text scuro: almeno 6 su calce e calce-sunk, almeno 4,5 sulle tinte", () => {
    for (const bg of ["calce", "calce-sunk"]) {
      expect(contrast("coccio-text", bg, "dark"), bg).toBeGreaterThanOrEqual(6);
    }
    for (const bg of TINTS) expect(contrast("coccio-text", bg, "dark"), bg).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["light", "dark"] as const)("bianco (on-coccio) su coccio 5,45 (%s)", (theme) => {
    expect(contrast("on-coccio", "coccio", theme)).toBeGreaterThanOrEqual(5.45);
  });

  it("coccio come superficie di bottone su calce scuro almeno 3,36", () => {
    expect(contrast("coccio", "calce", "dark")).toBeGreaterThanOrEqual(3.36);
  });

  it("voce locale: on-ink su ink 15,3 (chiaro) e 13,1 (scuro), ink-label su ink almeno 8,3", () => {
    expect(Number(contrast("on-ink", "ink", "light").toFixed(1))).toBeGreaterThanOrEqual(15.3);
    expect(Number(contrast("on-ink", "ink", "dark").toFixed(1))).toBeGreaterThanOrEqual(13.1);
    for (const theme of ["light", "dark"] as const) {
      expect(contrast("ink-label", "ink", theme), theme).toBeGreaterThanOrEqual(8.3);
    }
  });

  it.each(["light", "dark"] as const)("ricompense: lava su zagara-tint e on-zagara su zagara (%s)", (theme) => {
    expect(contrast("lava", "zagara-tint", theme)).toBeGreaterThanOrEqual(theme === "light" ? 14.5 : 11.2);
    expect(contrast("on-zagara", "zagara", theme)).toBeGreaterThanOrEqual(9.3);
  });

  it.each(["light", "dark"] as const)("border-control almeno 3 sullo sfondo (%s)", (theme) => {
    expect(contrast("border-control", "calce", theme)).toBeGreaterThanOrEqual(3);
  });
});

describe("asse ottico di Fraunces", () => {
  it("font-variation-settings imposta solo SOFT, mai opsz (sovrascriverebbe font-optical-sizing: auto)", () => {
    const css = readFileSync("src/components/design/isula.css", "utf8");
    for (const m of css.matchAll(/font-variation-settings:([^;]+);/g)) expect(m[1]).not.toMatch(/opsz/);
    expect(css).toContain("font-optical-sizing: auto");
    expect(JSON.stringify(tokens)).not.toContain("opticalSize");
  });
});

describe("controllo dei valori scritti a mano", () => {
  it("ignora i commenti su più righe ma non il codice che segue", () => {
    const content = ["/*", " Fraunces", "*/", "color: #fff;"].join(String.fromCharCode(10));
    expect(findViolations(content).map((v) => [v.line, v.rule])).toEqual([[4, "colore-esadecimale"]]);
  });

  it("non scambia // di un url per un commento", () => {
    expect(findViolations('const u = "https://x.test"; const c = "#abcdef";').map((v) => v.rule)).toContain(
      "colore-esadecimale",
    );
  });

  it.each([
    ["colore-esadecimale", 'const c = "#b5452b";'],
    ["colore-esadecimale", "color: #fff;"],
    ["colore-esadecimale", 'className="bg-[#123456]"'],
    ["funzione-colore", "background: rgba(0, 0, 0, 0.5);"],
    ["funzione-colore", "--x: oklch(0.2 0 0);"],
    ["nome-font", 'font-family: "Fraunces", serif;'],
    ["nome-font", 'import { Inter } from "next/font/google";'],
    ["colore-con-nome", "color: white;"],
    ["tavolozza-tailwind", 'className="bg-zinc-50 text-red-500"'],
    ["tavolozza-tailwind", 'className="text-white"'],
  ])("segnala %s: %s", (rule, line) => {
    expect(findViolations(line).map((v) => v.rule)).toContain(rule);
  });

  it.each([
    'className="bg-calce text-lava border-divider"',
    "color: var(--coccio-text);",
    'href="#contenuto"',
    'const url = "/it/profilo?tab=1#x";',
    "font-family: var(--font-display);",
    "box-shadow: var(--shadow-card);",
    "// Titoli in Fraunces, colore #b5452b",
    "/* nota: Georgia come alternativa */",
    "const x = 1; // bianco come #fff nel mockup",
  ])("non segnala: %s", (line) => {
    expect(findViolations(line)).toEqual([]);
  });
});
