import { chooseOption, pickDate } from "./helpers/controls";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Accessibilità (passo 11.4): axe-core su WCAG 2.2 AA, in tema chiaro e scuro, a 1280 e 390 px.
// Criterio: zero violazioni "serious" o "critical". Le "moderate" e le "minor" si elencano nel
// report (annotazioni del test) ma non bloccano. Nessuna regola e nessun elemento escluso, salvo
// casi motivati qui sotto.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SCHEMES = ["light", "dark"] as const;
const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
];
const TEMPLATE = "demo-weekend-palermo";

// Pagine pubbliche con dati demo (seed) dove serve un id.
const PUBLIC_PAGES = [
  "/it",
  "/it/attivita",
  "/it/attivita/demo-zingaro",
  "/it/itinerari",
  "/it/itinerari/demo-sicilia-orientale",
  "/it/luoghi/demo-trapani",
  "/it/voli",
  "/it/guide",
  "/it/guide/demo-guida-prima-volta",
  "/it/cerca?q=palermo",
  "/it/login",
  "/it/viaggio/nuovo",
  "/it/accessibilita",
];

// Usa il modello di itinerario come un utente con account (stesso flusso del builder).
async function useTemplate(page: Page) {
  // Pagina di salvataggio con l'indirizzo del link "Usa questo itinerario". Il click sul link in dev
  // a volte non completa la navigazione entro il test; il link è coperto da builder-2 e chat.
  await page.goto(`/it/viaggio/salva?da=${TEMPLATE}`);
  await pickDate(page, "Data di partenza", "2027-05-12");
  await chooseOption(page, "Persone", "4 persone");
  const save = page.getByRole("button", { name: "Salva il viaggio" });
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await save.click();
  await expect(page).toHaveURL(/\/it\/viaggi\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  return page.url().split("/").pop()!;
}

type Violation = { id: string; impact: string; help: string; nodes: { target: string[] }[] };
type Report = { serious: string[]; moderate: string[] };

// Esegue axe sulla pagina in tutte le combinazioni tema × larghezza e raccoglie le violazioni.
async function audit(page: Page, path: string, report: Report) {
  for (const scheme of SCHEMES) {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      await page.waitForLoadState("load");
      const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      for (const v of result.violations as Violation[]) {
        const line = `${path} [${scheme}, ${viewport.width}px] ${v.id} (${v.impact}): ${v.help}. Elementi: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`;
        if (v.impact === "serious" || v.impact === "critical") report.serious.push(line);
        else report.moderate.push(line);
      }
    }
  }
}

function finish(report: Report, info: TestInfo) {
  for (const line of report.moderate) {
    console.log(`MODERATE ${line}`);
    info.annotations.push({ type: "moderate", description: line });
  }
  expect(report.serious, report.serious.join("\n")).toEqual([]);
}

test("axe: pagine pubbliche, tema chiaro e scuro, 1280 e 390 px", async ({ page }) => {
  test.setTimeout(15 * 60_000);
  const report: Report = { serious: [], moderate: [] };
  for (const path of PUBLIC_PAGES) await audit(page, path, report);
  finish(report, test.info());
});

test("axe: pagine personali (utente con account e viaggio), tema chiaro e scuro, 1280 e 390 px", async ({ page, request }) => {
  test.setTimeout(20 * 60_000);
  await signUpWithCode(page, request);
  const tripId = await useTemplate(page);
  const report: Report = { serious: [], moderate: [] };
  for (const path of ["/it/viaggi", `/it/viaggi/${tripId}`, "/it/gruppi", "/it/profilo", "/it/punti", "/it/chat"]) {
    await audit(page, path, report);
  }
  finish(report, test.info());
});
