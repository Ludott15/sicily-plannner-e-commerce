// Controllo del design system su src/: nessun colore o font scritto a mano.
// I valori vivono solo in docs/design/tokens.json e arrivano come variabili CSS
// (generated/design/). Eseguito in CI: `npm run design:check`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const FONT_NAMES = [
  "Fraunces",
  "Instrument Sans",
  "Instrument_Sans",
  "Georgia",
  "Times New Roman",
  "Arial",
  "Helvetica",
  "Inter",
  "Geist",
  "Roboto",
  "Segoe UI",
];

const NAMED_COLORS = [
  "white",
  "black",
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "purple",
  "gray",
  "grey",
  "pink",
  "brown",
];

const TAILWIND_PALETTES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "white",
  "black",
];

const RULES = [
  {
    id: "colore-esadecimale",
    re: /(^|[^\w&/#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/,
  },
  {
    id: "funzione-colore",
    re: /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(\s*[\d.]/,
  },
  {
    id: "nome-font",
    re: new RegExp(`(^|[^\\w-])(?:${FONT_NAMES.map((f) => f.replace(/ /g, "\\s")).join("|")})(?![\\w-])`),
  },
  {
    id: "colore-con-nome",
    re: new RegExp(
      `(?:^|[;{\\s])(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|fill|stroke|outline-color)\\s*:\\s*(?:${NAMED_COLORS.join("|")})\\b`,
    ),
  },
  {
    id: "tavolozza-tailwind",
    re: new RegExp(
      `\\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|shadow|decoration|accent|caret|divide|placeholder)-(?:${TAILWIND_PALETTES.join("|")})(?:-\\d{2,3})?(?![\\w-])`,
    ),
  },
];

// I commenti documentano, non assegnano stili: si tolgono prima del controllo
// (blocchi /* */ anche su più righe, righe // e commenti a fine riga dopo uno spazio).
function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => (/^\s*\/\//.test(line) ? "" : line.replace(/\s\/\/\s.*$/, "")))
    .join("\n");
}

// Restituisce le violazioni trovate in un file: una per riga e regola.
export function findViolations(content) {
  const found = [];
  const original = content.split("\n");
  stripComments(content)
    .split("\n")
    .forEach((line, i) => {
      for (const rule of RULES) {
        if (rule.re.test(line)) found.push({ line: i + 1, rule: rule.id, text: original[i].trim() });
      }
    });
  return found;
}

const EXTENSIONS = /\.(?:ts|tsx|js|jsx|mjs|css)$/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (EXTENSIONS.test(entry)) yield path;
  }
}

function main() {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
  const src = join(root, "src");
  let total = 0;
  for (const path of walk(src)) {
    for (const v of findViolations(readFileSync(path, "utf8"))) {
      total++;
      console.error(`${relative(root, path)}:${v.line}  [${v.rule}]  ${v.text}`);
    }
  }
  if (total) {
    console.error(`\n${total} valori scritti a mano in src/: usa i token del design system (docs/design/tokens.json).`);
    process.exit(1);
  }
  console.log("Nessun colore o font scritto a mano in src/.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
