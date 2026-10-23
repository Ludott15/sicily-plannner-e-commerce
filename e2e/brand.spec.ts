import { expect, test } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Identità (passo 6.3): nome e marchio nel sito, manifest, favicon e icone, immagine verticale
// per i video (solo admin).

test("manifest, favicon e icone PWA rispondono con il marchio", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).name).toBe("Isula");

  const icon = await request.get("/icon.svg");
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");

  const pwa = await request.get("/icons/icon-192.png");
  expect(pwa.status()).toBe(200);
  expect(pwa.headers()["content-type"]).toContain("image/png");
  expect((await request.get("/icons/icon-999.png")).status()).toBe(404);
});

test("l'intestazione mostra il logo con il nome", async ({ page }) => {
  await page.goto("/it");
  const home = page.getByRole("link", { name: "Isula, pagina iniziale" });
  await expect(home).toBeVisible();
  await expect(home).toContainText("Isula");
});

test("un utente che non è admin non vede i contenuti video né l'immagine", async ({ page, request }) => {
  await signUpWithCode(page, request);
  const page404 = await page.goto("/it/admin/contenuti");
  expect(page404?.status()).toBe(404);
  const image = await page.request.get("/it/admin/contenuti/immagine?tipo=luogo&id=00000000-0000-4000-8000-000000000000");
  expect(image.status()).toBe(404);
});

test("admin: l'immagine verticale è un PNG e la pagina la mostra", async ({ page, request }) => {
  const email = await signUpWithCode(page, request);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);
  const [place] = await withDb((sql) => sql`select id from places where slug like 'demo-%' order by name limit 1`);
  if (!place) throw new Error("Il seed demo non ha luoghi: npm run db:reset");

  await page.goto("/it/admin/contenuti");
  await expect(page.getByRole("heading", { name: "Contenuti video" })).toBeVisible();
  await page.getByLabel("Itinerario o luogo").selectOption(`luogo:${place.id}`);
  await page.getByRole("button", { name: "Mostra anteprima" }).click();
  await expect(page.getByRole("link", { name: "Scarica PNG" })).toBeVisible();

  const res = await page.request.get(`/it/admin/contenuti/immagine?tipo=luogo&id=${place.id}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});
