// Screenshot di /dev/design nei due temi, desktop e mobile (390px).
// Uso: con `npm run dev` avviato, `node scripts/design/screenshots.mjs [base-url]`.
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const out = "docs/design/screenshots";
const viewports = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch();
const errors = [];
for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  page.on("console", (m) => m.type() === "error" && errors.push(`${vp.name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${vp.name}: ${e.message}`));
  await page.goto(`${base}/it/dev/design`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200); // animazioni di entrata (linea del percorso, timbro)
  for (const theme of ["light", "dark"]) {
    const path = `${out}/dev-design-${theme === "light" ? "chiaro" : "scuro"}-${vp.name}.png`;
    await page.locator(`section[data-theme="${theme}"]`).screenshot({ path });
    console.log(path);
  }
  await page.close();
}
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
