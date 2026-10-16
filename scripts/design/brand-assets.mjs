// Genera il kit del marchio a partire da docs/design/brand/logo/mark.json (geometria, unica
// fonte del logo) e da docs/design/tokens.json (colori):
//
//   docs/design/brand/logo/*.svg   kit per chi lavora fuori dal sito
//   src/app/icon.svg               favicon dell'app (Next la usa così com'è)
//   generated/design/brand.ts      percorsi del marchio per il componente Logo e le immagini next/og
//
//   node scripts/design/brand-assets.mjs          scrive i file
//   node scripts/design/brand-assets.mjs --check  esce con 1 se i file non sono aggiornati
//
// I colori dei file statici arrivano dai token: nessun esadecimale scritto a mano. Il marchio a
// colori è coccio; calce serve solo per il monocromatico sugli sfondi scuri.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tokens = JSON.parse(readFileSync(join(root, "docs", "design", "tokens.json"), "utf8"));
const mark = JSON.parse(readFileSync(join(root, "docs", "design", "brand", "logo", "mark.json"), "utf8"));

const HEADER = "Generato da scripts/design/brand-assets.mjs a partire da docs/design/brand/logo/mark.json e tokens.json. Non modificare a mano: npm run design:brand";

const round = (v) => String(Math.round(v * 100) / 100);

// Colore del tema chiaro, con gli alias {nome} risolti (come in og.ts).
const byName = new Map(tokens.color.tokens.map((t) => [t.name, t]));
function colorOf(name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`alias circolare: ${name}`);
  const value = byName.get(name)?.value;
  if (value === undefined) throw new Error(`token sconosciuto: ${name}`);
  const light = typeof value === "string" ? value : value.light;
  const alias = /^\{([a-z0-9-]+)\}$/.exec(light)?.[1];
  return alias ? colorOf(alias, new Set([...seen, name])) : light;
}

// Poligono con gli angoli arrotondati: su ogni vertice si taglia il lato per `r` e si
// collegano i due punti con una curva quadratica che passa per il vertice.
function roundedPolygon(points, r) {
  const n = points.length;
  const incoming = [];
  const outgoing = [];
  points.forEach((v, i) => {
    const toward = (p) => {
      const dx = p[0] - v[0];
      const dy = p[1] - v[1];
      const k = r / Math.hypot(dx, dy);
      return [v[0] + dx * k, v[1] + dy * k];
    };
    incoming[i] = toward(points[(i - 1 + n) % n]);
    outgoing[i] = toward(points[(i + 1) % n]);
  });
  const pt = (p) => `${round(p[0])} ${round(p[1])}`;
  let d = `M${pt(outgoing[0])}`;
  for (let step = 1; step <= n; step++) {
    const j = step % n;
    d += ` L${pt(incoming[j])} Q${pt(points[j])} ${pt(outgoing[j])}`;
  }
  return `${d} Z`;
}

function circlePath({ cx, cy, r }) {
  return `M${round(cx - r)} ${round(cy)}a${round(r)} ${round(r)} 0 1 0 ${round(2 * r)} 0a${round(r)} ${round(r)} 0 1 0 ${round(-2 * r)} 0Z`;
}

// L'isola (triangolo arrotondato) e il sole sopra di lei, separato: due forme, nessun foro.
const body = roundedPolygon(mark.island, mark.cornerRadius);
const sun = circlePath(mark.sun);
const mono = `${body} ${sun}`;

const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';
const VIEW = `viewBox="0 0 ${mark.viewBox} ${mark.viewBox}"`;
const coccio = colorOf("coccio");
const calce = colorOf("calce");
const lava = colorOf("lava");
const displayStack = tokens.type.families.display.replace(/"/g, "'");

const colourMark = (extra = "") =>
  `<svg ${SVG_NS} ${VIEW} role="img" aria-label="${mark.name}"${extra}>` +
  `<path fill="${coccio}" d="${body}"/><path fill="${coccio}" d="${sun}"/></svg>\n`;

const monoMark = (fill) =>
  `<svg ${SVG_NS} ${VIEW} role="img" aria-label="${mark.name}">` +
  `<path fill="${fill}" d="${mono}"/></svg>\n`;

// Logotipo orizzontale: marchio e nome in Fraunces (font-variation SOFT 50 nel sito; nel file
// il font è quello di sistema della famiglia dei token, con fallback serif).
const logoHorizontal = (textFill) =>
  `<svg ${SVG_NS} viewBox="0 0 124 32" role="img" aria-label="${mark.name}">` +
  `<path fill="${coccio}" d="${body}"/><path fill="${coccio}" d="${sun}"/>` +
  `<text x="40" y="24" font-family="${displayStack}" font-size="28" font-weight="600" letter-spacing="-0.4" fill="${textFill}">${mark.name}</text>` +
  `</svg>\n`;

const brandTs = [
  `// ${HEADER}`,
  "// Geometria del marchio (viewBox quadrato): body è l'isola, sun il sole, mono entrambi in un colore.",
  "export const brandMark = {",
  `  viewBox: "0 0 ${mark.viewBox} ${mark.viewBox}",`,
  `  body: "${body}",`,
  `  sun: "${sun}",`,
  `  mono: "${mono}",`,
  "} as const;",
  "",
].join("\n");

export function generate() {
  return {
    "docs/design/brand/logo/mark.svg": colourMark(),
    "docs/design/brand/logo/mark-mono.svg": monoMark(lava),
    "docs/design/brand/logo/mark-mono-on-dark.svg": monoMark(calce),
    "docs/design/brand/logo/logo-horizontal.svg": logoHorizontal(lava),
    "docs/design/brand/logo/logo-horizontal-on-dark.svg": logoHorizontal(calce),
    "src/app/icon.svg": colourMark(),
    "generated/design/brand.ts": brandTs,
  };
}

function main() {
  const files = generate();
  const check = process.argv.includes("--check");
  const stale = [];
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, rel);
    if (check) {
      const current = existsSync(path) ? readFileSync(path, "utf8") : null;
      if (current !== content) stale.push(rel);
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
  }
  if (check && stale.length) {
    console.error(`File del marchio non aggiornati: ${stale.join(", ")}. Esegui npm run design:brand.`);
    process.exit(1);
  }
  console.log(check ? "Marchio aggiornato." : `Scritti ${Object.keys(files).length} file del marchio.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
