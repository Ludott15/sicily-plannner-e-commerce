import { expect, test } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Ricerca nel sito (passo 11.2): suggerimenti nell'header con tastiera, pagina /cerca con lo stato
// vuoto, ricerche senza risultati ritrovate dall'admin, icona su mobile.

async function demoPlaceName(): Promise<string> {
  const { withDb } = await import("./db.mjs");
  const rows = await withDb((sql) => sql<{ name: string }[]>`select name from public.places where slug = 'demo-palermo'`);
  const name = rows[0]?.name;
  expect(name, "il seed deve contenere il luogo demo-palermo").toBeTruthy();
  return name ?? "";
}

test("header desktop: suggerimenti con errore di battitura, frecce, Esc e Invio aprono il luogo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const name = await demoPlaceName();
  await page.goto("/it");

  const combo = page.getByRole("combobox", { name: "Cerca nel sito" });
  await combo.fill("palemro");
  // Il nome accessibile dell'opzione include il sottotitolo (provincia).
  const option = page.getByRole("listbox", { name: "Suggerimenti" }).getByRole("option", { name: new RegExp(`^${name}( |$)`) });
  await expect(option).toBeVisible();
  await expect(combo).toHaveAttribute("aria-expanded", "true");

  // La prima freccia evidenzia la prima voce: il focus resta nel campo (aria-activedescendant).
  await combo.press("ArrowDown");
  await expect(option).toHaveAttribute("aria-selected", "true");
  await expect(combo).toHaveAttribute("aria-activedescendant", (await option.getAttribute("id")) ?? "");

  await combo.press("Escape");
  await expect(combo).toHaveAttribute("aria-expanded", "false");

  await combo.focus();
  await combo.press("ArrowDown");
  await expect(option).toHaveAttribute("aria-selected", "true");
  await combo.press("Enter");
  await expect(page).toHaveURL(/\/it\/luoghi\/demo-palermo$/);
});

test("/cerca senza risultati: stato vuoto con proposte, la ricerca finisce nel registro admin", async ({ page, request }) => {
  const query = "parolacheNonEsiste";
  await page.goto(`/it/cerca?q=${query}`);
  await expect(page.getByRole("heading", { name: `Nessun risultato per «${query}».` })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Itinerari pronti" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const email = await signUpWithCode(page, request, "e2e");
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);

  await page.goto("/it/admin/ricerche");
  await expect(page.getByRole("cell", { name: "parolachenonesiste", exact: true })).toBeVisible();
});

test("mobile 390: l'icona porta a /cerca con il campo a fuoco, senza scroll orizzontale", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/it");
  await expect(page.getByRole("combobox", { name: "Cerca nel sito" })).toBeHidden();

  await page.getByRole("link", { name: "Apri la ricerca" }).click();
  await expect(page).toHaveURL(/\/it\/cerca$/);
  await expect(page.getByRole("combobox", { name: "Cosa cerchi?" })).toBeFocused();

  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflows).toBe(false);
});
