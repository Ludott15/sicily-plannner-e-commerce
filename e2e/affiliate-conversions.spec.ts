import { expect, test } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Conversioni affiliate (passo 3.3): solo admin sulle pagine e sul modello; il cron senza
// Authorization risponde 401; un admin carica un CSV con un subid senza click, vede l'anteprima,
// conferma, e la dashboard degli ultimi 30 giorni la mostra tra le conversioni senza click.

test("un utente che non è admin non vede dashboard e importazione", async ({ page, request }) => {
  await signUpWithCode(page, request);
  for (const path of ["/it/admin/affiliati", "/it/admin/affiliati/importa"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  const template = await page.request.get("/it/admin/affiliati/importa/modello");
  expect(template.status()).toBe(404);
  const exportCsv = await page.request.get("/it/admin/affiliati/export");
  expect(exportCsv.status()).toBe(404);
});

test("il cron delle conversioni richiede il segreto", async ({ request }) => {
  const res = await request.get("/api/cron/import-conversions");
  expect(res.status()).toBe(401);
});

test("admin: anteprima, importazione, conversione senza click in dashboard", async ({ page, request }) => {
  const email = await signUpWithCode(page, request);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);

  const stamp = Date.now();
  const subid = `e2etest${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  const badSubid = `e2etest${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  const today = new Date().toISOString().slice(0, 10);
  const csv = [
    "partner;subid;external_id;amount_eur;commission_eur;status;reported_at",
    `getyourguide;${subid};e2e-${stamp}-1;120,00;9,60;approvata;${today}`,
    `getyourguide;${badSubid};e2e-${stamp}-2;importo non valido;1,00;pagata;${today}`,
  ].join("\r\n");

  await page.goto("/it/admin/affiliati/importa");
  await page.getByLabel("File CSV").setInputFiles({ name: "e2e-conversioni.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Anteprima", exact: true }).click();

  await expect(page.getByRole("table", { name: "Nuove conversioni" })).toContainText(subid);
  await expect(page.getByRole("table", { name: "Nuove conversioni" })).toContainText("Senza click");
  await expect(page.getByRole("table", { name: "Righe scartate" })).toContainText("Importo non valido");

  // L'anteprima non salva nulla.
  const before = await withDb((sql) => sql`select 1 from public.affiliate_conversions where subid = ${subid}`);
  expect(before).toHaveLength(0);

  await page.getByRole("button", { name: "Importa 1 riga", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Importate: 1 nuove, 0 aggiornate, 1 scartate, 1 senza click.",
  );

  const saved = await withDb(
    (sql) => sql`select partner::text, status, external_id from public.affiliate_conversions where subid = ${subid}`,
  );
  expect(saved).toEqual([{ partner: "getyourguide", status: "approved", external_id: `e2e-${stamp}-1` }]);

  // Dashboard degli ultimi 30 giorni: la conversione compare tra quelle senza click.
  await page.goto("/it/admin/affiliati?giorni=30");
  await expect(page.getByRole("table", { name: "Conversioni senza click" })).toContainText(subid);
  await expect(page.getByRole("link", { name: "Esporta CSV" })).toHaveAttribute("href", /\/admin\/affiliati\/export\?giorni=30/);
});
