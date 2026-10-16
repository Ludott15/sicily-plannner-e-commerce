import { expect, test, type Locator, type Page } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Navigazione da tastiera (passo 11.4): onboarding, builder, chat, dialog e menu. Il focus si porta
// con Tab/Shift+Tab (tabTo), poi si agisce con Invio, Spazio, frecce ed Esc. Il checkout non esiste
// ancora (passo 7) e non è coperto qui. Lo spostamento di una tappa da tastiera è in builder-2.spec.ts.

const TEMPLATE = "demo-weekend-palermo";

// Il builder e il viaggio si caricano in dev alla prima visita: il tempo del test non basta a 30 s.
test.describe.configure({ timeout: 180_000 });

// Preme Tab finché il primo elemento corrispondente ha il focus. Fallisce se non ci arriva.
async function tabTo(page: Page, target: Locator, max = 80) {
  for (let i = 0; i <= max; i++) {
    const focused = await target
      .first()
      .evaluate((el) => el === document.activeElement)
      .catch(() => false);
    if (focused) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`il focus non arriva al controllo con Tab dopo ${max} passi`);
}

// Il focus è dentro il dialog aperto (o nel suo sottoalbero).
async function focusInside(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const active = document.activeElement;
    return !!active && !!active.closest(sel);
  }, selector);
}

// Viaggio di prova dal modello pronto, come nel builder: l'utente è ospite (come builder-2).
async function useTemplate(page: Page) {
  // Vai alla pagina di salvataggio con l'indirizzo del link "Usa questo itinerario". Il click sul link
  // in dev a volte non completa la navigazione entro il test; il link è coperto da builder-2 e chat.
  await page.goto(`/it/viaggio/salva?da=${TEMPLATE}`);
  await page.getByLabel("Data di partenza").fill("2027-05-12");
  await page.getByLabel("Persone").selectOption("4");
  const save = page.getByRole("button", { name: "Salva il viaggio" });
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await save.click();
  await expect(page).toHaveURL(/\/it\/viaggi\/[0-9a-f-]{36}$/, { timeout: 60_000 });
}

test("onboarding da tastiera: radio con Spazio, Tab fino ad Avanti, Invio", async ({ page }) => {
  await page.goto("/it/viaggio/nuovo");
  await expect(page.getByText("Domanda 1 di 7")).toBeVisible();

  // Un gruppo di radio è un solo punto di Tab: si entra con Tab e si sceglie con le frecce.
  const threeDays = page.getByRole("radio", { name: "3 giorni" });
  await tabTo(page, page.getByRole("radio").first());
  for (let i = 0; i < 6 && !(await threeDays.isChecked()); i++) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(threeDays).toBeChecked();

  await tabTo(page, page.getByRole("button", { name: "giu", exact: true }));
  await page.keyboard.press("Enter");
  const next = page.getByRole("button", { name: "Avanti", exact: true });
  await tabTo(page, next);
  await expect(next).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/domanda=2$/);

  // Interessi: i chip sono pulsanti con aria-pressed; Invio li sceglie.
  await tabTo(page, page.getByRole("button", { name: "Mare", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Mare", exact: true })).toHaveAttribute("aria-pressed", "true");
  await tabTo(page, page.getByRole("button", { name: "Cibo e vino", exact: true }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: "Avanti · 2 scelti" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/domanda=3$/);
});

test("builder: il dialog di conferma tiene il focus, Esc chiude e riporta il focus al pulsante", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await useTemplate(page);
  await page.getByRole("button", { name: "Aggiungi un giorno" }).click();
  await page.getByRole("button", { name: /^Giorno 4 · / }).click();

  const opener = page.getByRole("button", { name: "Togli il giorno 4" });
  await tabTo(page, opener);
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await focusInside(page, "dialog")).toBe(true);
  // Dieci Tab: il focus non esce dal dialog (focus trap del <dialog> modale).
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    expect(await focusInside(page, "dialog"), `Tab ${i + 1}`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("builder: il menu delle azioni con frecce, Esc e ritorno del focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await useTemplate(page);
  const trigger = page.getByRole("button", { name: "Altre azioni del viaggio" });
  await tabTo(page, trigger);
  await page.keyboard.press("Enter");

  // Le voci disabilitate (per gli ospiti) non ricevono il focus: le frecce saltano solo quelle attive.
  const items = page.getByRole("menuitem");
  await expect(items.first()).toBeFocused();
  const focusedLabel = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  const first = await focusedLabel();
  await page.keyboard.press("ArrowDown");
  const second = await focusedLabel();
  expect(second).not.toBe(first);
  await expect(page.locator(":focus")).toHaveAttribute("role", "menuitem");
  await page.keyboard.press("End");
  await expect(page.locator(":focus")).toHaveAttribute("role", "menuitem");
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(items.first()).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("menu personale da tastiera: Invio apre, Esc torna al pulsante", async ({ page, request }) => {
  await signUpWithCode(page, request);
  await page.goto("/it");
  const trigger = page.getByRole("button", { name: "Menu personale" });
  await tabTo(page, trigger);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("assistente da tastiera: si apre con Invio, si scrive e si invia, Esc chiude e riporta il focus", async ({ page, request }) => {
  test.setTimeout(180_000);
  await signUpWithCode(page, request);
  await useTemplate(page);

  const launcher = page.getByRole("button", { name: "Chiedi all'assistente" });
  await tabTo(page, launcher);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const box = dialog.getByLabel("Scrivi all'assistente");
  await tabTo(page, box);
  await page.keyboard.type("Quali attività ci sono a Palermo?");
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("link", { name: /^Vedi/ }).first()).toBeVisible({ timeout: 60_000 });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
});

test("focus visibile: ogni elemento raggiunto con Tab nell'intestazione ha un contorno", async ({ page }) => {
  await page.goto("/it");
  const seen: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        label: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 40),
        outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0,
        shadow: s.boxShadow !== "none",
      };
    });
    if (!info) continue;
    seen.push(info.label);
    expect(info.outline || info.shadow, `senza focus visibile: ${info.label}`).toBe(true);
  }
  expect(seen.length).toBeGreaterThan(3);
});
