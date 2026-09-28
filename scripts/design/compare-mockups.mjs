// Screenshot delle pagine affiancati ai mockup (docs/design/mockups), tema chiaro a 1280 e
// 390px, più la pagina in tema scuro. Uso: con `npm run dev` avviato,
//   node scripts/design/compare-mockups.mjs [base-url]
// Scrive in docs/design/screenshots/m3/.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const base = process.argv[2] ?? "http://localhost:3000";
const out = "docs/design/screenshots/m3";
const tmp = join(out, ".tmp");
const mockups = resolve("docs/design/mockups");

const PAGES = [
  { name: "home", path: "/it", desktop: "Home.html", mobile: "HomeMobile.html" },
  { name: "attivita-lista", path: "/it/attivita" },
  { name: "attivita-scheda", path: "/it/attivita/demo-zingaro", desktop: "Attivita.html", mobile: "AttivitaMobile.html" },
  { name: "itinerari-lista", path: "/it/itinerari" },
  {
    name: "itinerario-pronto",
    path: "/it/itinerari/demo-sicilia-orientale",
    desktop: "Itinerario.html",
    mobile: "ItinerarioProntoMobile.html",
  },
  { name: "luogo", path: "/it/luoghi/demo-trapani" },
];

const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };

mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch();

async function shot(url, viewport, colorScheme, path) {
  const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // In uno screenshot a pagina intera un elemento fisso resterebbe alla posizione della
  // prima schermata: le barre in basso si spostano in fondo alla pagina.
  await page.addStyleTag({ content: "body{position:relative} body .fixed.bottom-0{position:absolute!important}" });
  await page.waitForTimeout(1100); // linea del percorso e animazioni di entrata
  await page.screenshot({ path, fullPage: true });
  await page.close();
}

// Affianca due immagini con un'intestazione, disegnando una pagina HTML e fotografandola.
async function compose(left, right, labels, path, width) {
  const img = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
  const html = `<!doctype html><body style="margin:0;background:#888;font:600 14px sans-serif">
    <div style="display:flex;gap:16px;padding:16px;align-items:flex-start">
      ${[left, right]
        .map(
          (p, i) => `<figure style="margin:0;width:${width}px"><figcaption style="color:#fff;padding:0 0 8px">${labels[i]}</figcaption><img src="${img(p)}" style="display:block;width:${width}px"></figure>`,
        )
        .join("")}
    </div></body>`;
  const file = join(tmp, "compose.html");
  writeFileSync(file, html);
  const page = await browser.newPage({ viewport: { width: width * 2 + 48, height: 800 } });
  await page.goto(pathToFileURL(resolve(file)).href);
  await page.screenshot({ path, fullPage: true });
  await page.close();
}

for (const p of PAGES) {
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    const pageShot = join(tmp, `${p.name}-${vpName}.png`);
    await shot(`${base}${p.path}`, viewport, "light", pageShot);
    const mockup = p[vpName];
    const target = join(out, `${p.name}-${vpName}-chiaro.png`);
    if (mockup) {
      const mockShot = join(tmp, `${p.name}-${vpName}-mockup.png`);
      await shot(pathToFileURL(join(mockups, mockup)).href, viewport, "light", mockShot);
      await compose(mockShot, pageShot, [`Mockup: ${mockup}`, `Pagina: ${p.path}`], target, viewport.width);
    } else {
      writeFileSync(target, readFileSync(pageShot));
    }
    console.log(target);
  }
  const dark = join(out, `${p.name}-desktop-scuro.png`);
  await shot(`${base}${p.path}`, VIEWPORTS.desktop, "dark", dark);
  console.log(dark);
}

await browser.close();
rmSync(tmp, { recursive: true, force: true });
