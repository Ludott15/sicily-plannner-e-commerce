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
// Il marchio è una piastrella di maiolica (quadrato con angoli appena arrotondati, colore coccio)
// con una rosetta a tre petali in calce al centro. Il centro è il coccio della piastrella che
// resta tra le punte dei petali. Nel monocromatico la piastrella è piena e la rosetta è un foro
// (fill-rule evenodd): il colore lo decide chi usa il marchio.
// I colori dei file statici arrivano dai token: nessun esadecimale scritto a mano.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tokens = JSON.parse(readFileSync(join(root, "docs", "design", "tokens.json"), "utf8"));
const mark = JSON.parse(readFileSync(join(root, "docs", "design", "brand", "logo", "mark.json"), "utf8"));

const HEADER = "Generato da scripts/design/brand-assets.mjs a partire da docs/design/brand/logo/mark.json e tokens.json. Non modificare a mano: npm run design:brand";

const round = (v) => String(Math.round(v * 100) / 100);
const rad = (deg) => (deg * Math.PI) / 180;

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

// Quadrato con angoli arrotondati da `r` (0 = angoli vivi), coordinate del viewBox.
function tilePath(size, r) {
  if (r === 0) return `M0 0H${size}V${size}H0Z`;
  const s = round(size);
  const k = round(size - r);
  const q = round(r);
  return (
    `M${q} 0H${k}A${q} ${q} 0 0 1 ${s} ${q}V${k}A${q} ${q} 0 0 1 ${k} ${s}` +
    `H${q}A${q} ${q} 0 0 1 0 ${k}V${q}A${q} ${q} 0 0 1 ${q} 0Z`
  );
}

// Rosetta: una sola forma connessa. Al centro un disco (hub); da ognuno dei `petals` petali,
// a distanza uguale (360/n), esce una lama lunga `length` che si curva di `bend` gradi nello
// stesso verso (girandola). Il contorno è un'unica spezzata: ogni lato di petalo è campionato,
// e tra un petalo e il successivo il contorno segue l'arco del disco. Nessuna sovrapposizione,
// quindi il monocromatico con evenodd resta corretto. `scale` allarga tutto dal centro.
const SAMPLES = 22;
function rosettePath({ center: [cx, cy], rotate, petals, hub, length, width, bend }, scale = 1) {
  const R = hub * scale;
  const L = length * scale;
  const half = (width * scale) / 2;
  const t0 = R / L;
  const bendRad = rad(bend);
  const pt = (p) => `${round(p[0])} ${round(p[1])}`;
  const spine = (t, a) => {
    const theta = a + bendRad * Math.pow(t, 1.5);
    const r = L * t;
    return [cx + r * Math.cos(theta), cy + r * Math.sin(theta)];
  };
  const halfWidth = (t) => half * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8);
  // Un lato del petalo (sign -1 o +1), da t0 alla punta.
  const edge = (a, sign) => {
    const pts = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const t = t0 + ((1 - t0) * k) / SAMPLES;
      const p = spine(t, a);
      const e = 1e-4;
      const q1 = spine(Math.min(1, t + e), a);
      const q0 = spine(Math.max(0, t - e), a);
      const dx = q1[0] - q0[0];
      const dy = q1[1] - q0[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const w = halfWidth(t) * sign;
      pts.push([p[0] + nx * w, p[1] + ny * w]);
    }
    return pts;
  };
  const angles = Array.from({ length: petals }, (_, i) => rad(rotate - 90 + (360 / petals) * i));
  let d = "";
  angles.forEach((a, i) => {
    const left = edge(a, -1);
    const right = edge(a, 1).reverse();
    if (i === 0) d += `M${pt(left[0])}`;
    for (const p of left.slice(1)) d += `L${pt(p)}`;
    for (const p of right.slice(1)) d += `L${pt(p)}`;
    const base = right[right.length - 1];
    const nextStart = edge(angles[(i + 1) % petals], -1)[0];
    const rb = round(Math.hypot(base[0] - cx, base[1] - cy));
    d += `A${rb} ${rb} 0 0 1 ${pt(nextStart)}`;
  });
  return `${d}Z`;
}

// Centra la rosetta sul riquadro di ingombro reale (punte comprese) e la scala uniformemente
// finché la punta più lontana dal centro sta a `margin` del lato dal bordo. La forma non cambia:
// si spostano il centro e le dimensioni di un fattore uniforme. Il bbox si stima dai punti M/L
// (gli archi del disco stanno dentro le lame, quindi non sporgono).
function fitRosette(cfg, margin) {
  const raw = rosettePath(cfg, 1);
  const xs = [];
  const ys = [];
  for (const m of raw.matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)) {
    xs.push(Number(m[1]));
    ys.push(Number(m[2]));
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const [c0x, c0y] = cfg.center;
  const bcx = (minX + maxX) / 2;
  const bcy = (minY + maxY) / 2;
  const halfMax = Math.max(maxX - minX, maxY - minY) / 2;
  const target = VIEW_SIZE / 2 - VIEW_SIZE * margin;
  const s = target / halfMax;
  // Con centro X e parametri scalati, il bbox ha centro X + s * (bbox0 - centro0): lo si porta a 16.
  const X = VIEW_SIZE / 2 - s * (bcx - c0x);
  const Y = VIEW_SIZE / 2 - s * (bcy - c0y);
  return rosettePath(
    { ...cfg, center: [X, Y], hub: cfg.hub * s, length: cfg.length * s, width: cfg.width * s },
    1,
  );
}

const VIEW_SIZE = mark.viewBox;
const tile = tilePath(VIEW_SIZE, mark.tile.radius);
const rosette = fitRosette(mark.rosette, mark.rosette.margin);
const appTile = tilePath(VIEW_SIZE, mark.tile.appRadius);
const appRosette = fitRosette(mark.rosette, mark.rosette.appMargin);
// Monocromatico: piastrella piena con la rosetta come foro (evenodd, petali non sovrapposti).
const mono = `${tile} ${rosette}`;

const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';
const VIEW = `viewBox="0 0 ${VIEW_SIZE} ${VIEW_SIZE}"`;
const coccio = colorOf("coccio");
const calce = colorOf("calce");
const lava = colorOf("lava");
const displayStack = tokens.type.families.display.replace(/"/g, "'");

const colourMark = (extra = "") =>
  `<svg ${SVG_NS} ${VIEW} role="img" aria-label="${mark.name}"${extra}>` +
  `<path fill="${coccio}" d="${tile}"/><path fill="${calce}" d="${rosette}"/></svg>\n`;

const monoMark = (fill) =>
  `<svg ${SVG_NS} ${VIEW} role="img" aria-label="${mark.name}">` +
  `<path fill="${fill}" fill-rule="evenodd" d="${mono}"/></svg>\n`;

// Icona dell'app a tutto campo: la piastrella occupa l'intero quadrato, la rosetta è più grande.
const appIconSvg =
  `<svg ${SVG_NS} ${VIEW} role="img" aria-label="${mark.name}">` +
  `<path fill="${coccio}" d="${appTile}"/><path fill="${calce}" d="${appRosette}"/></svg>\n`;

// Logotipo orizzontale: marchio e nome in Fraunces (font-variation SOFT 50 nel sito; nel file
// il font è quello di sistema della famiglia dei token, con fallback serif).
const logoHorizontal = (textFill) =>
  `<svg ${SVG_NS} viewBox="0 0 124 32" role="img" aria-label="${mark.name}">` +
  `<path fill="${coccio}" d="${tile}"/><path fill="${calce}" d="${rosette}"/>` +
  `<text x="40" y="24" font-family="${displayStack}" font-size="28" font-weight="600" letter-spacing="-0.4" fill="${textFill}">${mark.name}</text>` +
  `</svg>\n`;

const brandTs = [
  `// ${HEADER}`,
  "// Geometria del marchio (viewBox quadrato). tile: piastrella coccio; rosette: petali in calce;",
  "// mono: piastrella con la rosetta come foro (fillRule evenodd). appIcon: piastrella a tutto campo.",
  "export const brandMark = {",
  `  viewBox: "0 0 ${VIEW_SIZE} ${VIEW_SIZE}",`,
  `  tile: "${tile}",`,
  `  rosette: "${rosette}",`,
  `  mono: "${mono}",`,
  "} as const;",
  "",
  "export const brandAppIcon = {",
  `  viewBox: "0 0 ${VIEW_SIZE} ${VIEW_SIZE}",`,
  `  tile: "${appTile}",`,
  `  rosette: "${appRosette}",`,
  "} as const;",
  "",
].join("\n");

export function generate() {
  return {
    "docs/design/brand/logo/mark.svg": colourMark(),
    "docs/design/brand/logo/mark-mono.svg": monoMark(lava),
    "docs/design/brand/logo/mark-mono-on-dark.svg": monoMark(calce),
    "docs/design/brand/logo/app-icon.svg": appIconSvg,
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
