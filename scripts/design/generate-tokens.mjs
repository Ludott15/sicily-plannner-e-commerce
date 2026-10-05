// Genera le variabili CSS, il tema Tailwind e il caricamento dei font a partire da
// docs/design/tokens.json, fonte unica del design system.
//
//   node scripts/design/generate-tokens.mjs          scrive generated/design/*
//   node scripts/design/generate-tokens.mjs --check  esce con 1 se i file non sono aggiornati
//
// L'output è deterministico: stesso tokens.json, stessi file byte per byte.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HEADER =
  "Generato da scripts/design/generate-tokens.mjs a partire da docs/design/tokens.json. Non modificare a mano: npm run design:tokens";

// Da questa larghezza valgono le dimensioni desktop dei titoli display.
const DESKTOP_MIN_WIDTH = "768px";

// Assi variabili caricati per ogni famiglia (manuale: Fraunces con opsz e SOFT).
const FONT_AXES = { display: ["opsz", "SOFT"], sans: [] };

const aliasOf = (value) => /^\{([a-z0-9-]+)\}$/.exec(value)?.[1];

function cssValue(value) {
  const alias = aliasOf(value);
  return alias ? `var(--${alias})` : value;
}

function themeValue(value, theme) {
  return typeof value === "string" ? value : value[theme];
}

function block(selector, lines, indent = "") {
  return [`${indent}${selector} {`, ...lines.map((l) => `${indent}  ${l}`), `${indent}}`].join("\n");
}

function colorLines(tokens, theme) {
  const lines = [`color-scheme: ${theme};`];
  for (const t of tokens.color.tokens) lines.push(`--${t.name}: ${cssValue(themeValue(t.value, theme))};`);
  for (const t of tokens.shadow.tokens) lines.push(`--${t.name}: ${themeValue(t.value, theme)};`);
  return lines;
}

// Nome della famiglia principale in tokens.type.families ("\"Fraunces\", Georgia, ..." → Fraunces).
function primaryFamily(stack) {
  const first = stack.split(",")[0].trim();
  return first.replace(/^"(.*)"$/, "$1");
}

// Resto della pila di fallback, dopo la famiglia principale.
function fallbackStack(stack) {
  return stack.split(",").slice(1).map((s) => s.trim()).join(", ");
}

function typeStyles(tokens) {
  const styles = [];
  for (const group of tokens.type.groups) {
    for (const style of group.styles) {
      const mobile = /Da (\d+)px su mobile/.exec(style.usage ?? "")?.[1];
      styles.push({
        name: style.name,
        family: group.family,
        size: style.fontSize,
        mobileSize: mobile ? `${mobile}px` : null,
        lineHeight: String(style.lineHeight),
        weight: String(style.fontWeight),
        tracking: style.letterSpacing ?? "normal",
      });
    }
  }
  return styles;
}

function tokensCss(tokens) {
  const families = tokens.type.families;
  const styles = typeStyles(tokens);

  const base = [
    ...Object.entries(families).map(
      ([key, stack]) => `--font-${key}: var(--font-${key}-face), ${fallbackStack(stack)};`,
    ),
    ...tokens.spacing.tokens.map((t) => `--${t.name}: ${t.value};`),
    ...tokens.radius.tokens.map((t) => `--${t.name}: ${t.value};`),
    ...tokens.duration.tokens.map((t) => `--${t.name}: ${t.value};`),
    ...tokens.easing.tokens.map((t) => `--${t.name}: ${t.value};`),
    ...styles.flatMap((s) => [
      `--type-${s.name}-family: var(--font-${s.family});`,
      `--type-${s.name}-size: ${s.mobileSize ?? s.size};`,
      `--type-${s.name}-line-height: ${s.lineHeight};`,
      `--type-${s.name}-weight: ${s.weight};`,
      `--type-${s.name}-tracking: ${s.tracking};`,
    ]),
  ];

  const desktop = styles.filter((s) => s.mobileSize).map((s) => `--type-${s.name}-size: ${s.size};`);

  return [
    `/* ${HEADER} */`,
    "",
    block(':root,\n[data-theme="light"]', colorLines(tokens, "light")),
    "",
    block('[data-theme="dark"]', colorLines(tokens, "dark")),
    "",
    `@media (prefers-color-scheme: dark) {`,
    block(':root:not([data-theme="light"])', colorLines(tokens, "dark"), "  "),
    `}`,
    "",
    block(":root", base),
    "",
    `@media (min-width: ${DESKTOP_MIN_WIDTH}) {`,
    block(":root", desktop, "  "),
    `}`,
    "",
  ].join("\n");
}

function themeCss(tokens) {
  const styles = typeStyles(tokens);
  const inline = [
    ...tokens.color.tokens.map((t) => `--color-${t.name}: var(--${t.name});`),
    ...Object.keys(tokens.type.families).map((key) => `--font-${key}: var(--font-${key});`),
    `--spacing: var(--${tokens.spacing.tokens[0].name});`,
    ...tokens.radius.tokens.map((t) => `--${t.name}: var(--${t.name});`),
    ...tokens.shadow.tokens.map((t) => `--${t.name}: var(--${t.name});`),
    ...tokens.easing.tokens.map((t) => `--${t.name}: var(--${t.name});`),
    ...styles.flatMap((s) => [
      `--text-${s.name}: var(--type-${s.name}-size);`,
      `--text-${s.name}--line-height: var(--type-${s.name}-line-height);`,
      `--text-${s.name}--letter-spacing: var(--type-${s.name}-tracking);`,
      `--text-${s.name}--font-weight: var(--type-${s.name}-weight);`,
    ]),
  ];

  return [
    `/* ${HEADER} */`,
    "/* Tema Tailwind: solo i valori del design system. Le tavolozze e i font predefiniti di Tailwind sono azzerati. */",
    "",
    block("@theme", [
      "--color-*: initial;",
      "--font-*: initial;",
      "--radius-*: initial;",
      "--shadow-*: initial;",
      "--ease-*: initial;",
    ]),
    "",
    block("@theme inline", inline),
    "",
  ].join("\n");
}

function fontsTs(tokens) {
  const entries = Object.entries(tokens.type.families).map(([key, stack]) => {
    const family = primaryFamily(stack);
    return { key, family, loader: family.replace(/ /g, "_") };
  });
  const loaders = [...new Set(entries.map((e) => e.loader))].sort();

  const lines = [
    `// ${HEADER}`,
    "// Font variabili: si carica l'intervallo dei pesi; i pesi usati vengono dai token.",
    `import { ${loaders.join(", ")} } from "next/font/google";`,
    "",
  ];
  for (const e of entries) {
    const name = `font${e.key[0].toUpperCase()}${e.key.slice(1)}`;
    const axes = FONT_AXES[e.key] ?? [];
    lines.push(
      `export const ${name} = ${e.loader}({`,
      `  subsets: ["latin"],`,
      ...(axes.length ? [`  axes: [${axes.map((a) => `"${a}"`).join(", ")}],`] : []),
      `  display: "swap",`,
      `  variable: "--font-${e.key}-face",`,
      `});`,
      "",
    );
  }
  lines.push(
    `export const fontVariables = [${entries
      .map((e) => `font${e.key[0].toUpperCase()}${e.key.slice(1)}.variable`)
      .join(", ")}].join(" ");`,
    "",
  );
  return lines.join("\n");
}

// Immagini Open Graph (next/og): non leggono le variabili CSS, quindi i colori arrivano qui
// già risolti, nel tema chiaro (le anteprime dei social non hanno un tema scuro), e le
// famiglie dei font con i loro nomi.
function ogTs(tokens) {
  const byName = new Map(tokens.color.tokens.map((t) => [t.name, t]));
  const resolve = (name, seen = new Set()) => {
    if (seen.has(name)) throw new Error(`alias circolare: ${name}`);
    const value = themeValue(byName.get(name).value, "light");
    const alias = aliasOf(value);
    return alias ? resolve(alias, new Set([...seen, name])) : value;
  };
  const colors = tokens.color.tokens.map((t) => `  "${t.name}": "${resolve(t.name)}",`);
  const families = Object.entries(tokens.type.families).map(([key, stack]) => `  ${key}: "${primaryFamily(stack)}",`);
  return [
    `// ${HEADER}`,
    "// Per le immagini Open Graph (next/og), che non leggono le variabili CSS: tema chiaro.",
    "export const ogColors = {",
    ...colors,
    "} as const;",
    "",
    "export const ogFamilies = {",
    ...families,
    "} as const;",
    "",
  ].join("\n");
}

export function generate(tokens) {
  return {
    "tokens.css": tokensCss(tokens),
    "theme.css": themeCss(tokens),
    "fonts.ts": fontsTs(tokens),
    "og.ts": ogTs(tokens),
  };
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TOKENS_PATH = join(root, "docs", "design", "tokens.json");
export const OUTPUT_DIR = join(root, "generated", "design");

function main() {
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf8"));
  const files = generate(tokens);
  const check = process.argv.includes("--check");

  let stale = [];
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const path = join(OUTPUT_DIR, name);
    if (check) {
      let current = null;
      try {
        current = readFileSync(path, "utf8");
      } catch {}
      if (current !== content) stale.push(name);
    } else {
      writeFileSync(path, content);
    }
  }

  if (check && stale.length) {
    console.error(`File del design system non aggiornati: ${stale.join(", ")}. Esegui npm run design:tokens.`);
    process.exit(1);
  }
  console.log(check ? "Token aggiornati." : `Scritti ${Object.keys(files).length} file in generated/design.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
