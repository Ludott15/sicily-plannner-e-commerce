import { expect, test, type Request } from "@playwright/test";
import sharp from "sharp";
import { signUpWithCode } from "./helpers";

// Immagini del catalogo (docs/IMMAGINI.md): caricamento admin con abbinamento per nome file,
// rifiuto con il motivo, EXIF e GPS rimossi, pubblicazione solo con i dati completi,
// didascalia nella pagina; le azioni del caricamento sono riservate all'admin anche se
// chiamate direttamente; lo storage non serve gli originali.

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 190, g: 110, b: 70 } } })
    .withExif({
      IFD0: { Make: "Fotocamera e2e" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 3/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "15/1 17/1 0/1" },
    })
    .jpeg()
    .toBuffer();

test("admin: carica una foto per nome file, la completa e la pubblica; un non admin non può usare le azioni", async ({
  page,
  request,
  browser,
}) => {
  const { withDb } = await import("./db.mjs");
  const slug = `e2e-luogo-foto-${Date.now()}`;
  await withDb(
    (sql) => sql`
      insert into public.places (slug, name, province, lat, lng, area_id)
      values (${slug}, 'e2e- Luogo con foto', 'SR', 37.06, 15.29, (select id from public.areas where slug = 'siracusano'))`,
  );

  const email = await signUpWithCode(page, request);
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);

  // Si annota la richiesta dell'azione "prepare" per riprovarla da non admin.
  let prepareRequest: Request | null = null;
  page.on("request", (req) => {
    if (!prepareRequest && req.method() === "POST" && req.headers()["next-action"] && req.postData()?.includes('"size"')) {
      prepareRequest = req;
    }
  });

  await page.goto("/it/admin/media");
  await page.getByLabel("Carica immagini").setInputFiles([
    { name: `${slug}-01.jpg`, mimeType: "image/jpeg", buffer: await photo(1800, 1200) },
    { name: "e2e-piccola-01.jpg", mimeType: "image/jpeg", buffer: await photo(1200, 800) },
  ]);
  await page.getByRole("button", { name: "Carica", exact: true }).click();
  const results = page.getByTestId("upload-results");
  await expect(results.locator('li[data-status="done"]')).toContainText("ora è la copertina", { timeout: 60_000 });
  await expect(results.locator('li[data-status="error"]')).toContainText("Troppo piccola: 1200×800");

  const [row] = await withDb(
    (sql) => sql`
      select m.id, m.storage_path, m.variants_version, public.media_is_usable(m.id) as usable
      from public.places p join public.media m on m.id = p.cover_media_id where p.slug = ${slug}`,
  );
  expect(row).toMatchObject({ variants_version: 1, usable: false });

  // L'originale nello storage non ha più EXIF né GPS (letto con la chiave di servizio locale).
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  const master = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/media/${row!.storage_path}`, {
    headers: { apikey: process.env.SUPABASE_SECRET_KEY!, authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` },
  });
  expect(master.status).toBe(200);
  const masterBuffer = Buffer.from(await master.arrayBuffer());
  expect((await sharp(masterBuffer).metadata()).exif).toBeUndefined();
  expect(masterBuffer.includes(Buffer.from("GPS"))).toBe(false);

  // Bloccata finché mancano i dati: la pagina usa il ripiego (illustrazione dell'area).
  await page.goto(`/it/luoghi/${slug}`);
  await expect(page.locator("figcaption").first()).toHaveText("Illustrazione di Isula");

  // Completata dalla tabella: testo alternativo, autore e licenza.
  await page.goto("/it/admin/media");
  const form = page.getByTestId(`media-form-${row!.id}`);
  await form.getByLabel("Testo alternativo (italiano)").fill("e2e- Scalinata in pietra al tramonto");
  await form.getByLabel("Autore", { exact: true }).fill("Autore e2e");
  await form.getByLabel("Licenza", { exact: true }).fill("CC0 1.0");
  await form.getByRole("button", { name: "Salva" }).click();
  // Completata: esce da "Da completare" ed è usabile.
  await expect(form).toHaveCount(0);
  const [saved] = await withDb((sql) => sql`select public.media_is_usable(${row!.id}::uuid) as usable`);
  expect(saved!.usable).toBe(true);

  await page.goto(`/it/luoghi/${slug}`);
  await expect(page.getByRole("img", { name: "e2e- Scalinata in pietra al tramonto" })).toBeVisible();
  await expect(page.locator("figcaption").first()).toHaveText("Foto: Autore e2e, CC0 1.0");
  await expect(page.locator(`source[type="image/avif"]`).first()).toHaveAttribute("srcset", /\/api\/media\/.+\/v1\/16x9-480\.avif 480w/);

  // Dal pubblico: la variante sì, l'originale no.
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`/api/media/${row!.id}/v1/4x5-480.webp`)).status()).toBe(200);
  expect((await anonymous.request.get(`/api/media/${row!.storage_path}`)).status()).toBe(404);
  expect((await anonymous.request.get(`/api/media/${row!.id}/v1/4x5-480.webp`)).headers()["cache-control"]).toContain("public");

  // Un utente non admin che chiama direttamente l'azione "prepare" non ottiene URL di caricamento.
  expect(prepareRequest).not.toBeNull();
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signUpWithCode(otherPage, other.request);
  const res = await other.request.post("/it/admin/media", {
    headers: {
      "next-action": prepareRequest!.headers()["next-action"]!,
      "content-type": prepareRequest!.headers()["content-type"]!,
      accept: "text/x-component",
    },
    data: prepareRequest!.postData()!,
  });
  // requireAdmin risponde 404 (l'area admin non si rivela); senza, la policy dello storage
  // negherebbe comunque l'URL firmato (seconda difesa).
  expect(res.status()).toBe(404);
  const body = await res.text();
  expect(body).not.toContain("uploadUrl");
  expect(body).not.toContain("/object/upload/sign/");
  await anonymous.close();
  await other.close();
});

test("admin: copertura delle immagini per area e tipo", async ({ page, request }) => {
  const email = await signUpWithCode(page, request);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);
  await page.goto("/it/admin/copertura");
  // Seed e immagini demo (npm run media:demo): Bronte è senza foto propria e mostra
  // l'illustrazione dell'area; le attività dei luoghi con foto usano il ripiego.
  const etna = page.locator('tr[data-image-area="etna-costa-ionica"]');
  await expect(etna.locator('td[data-entity="place"]')).toHaveText("3 foto · 0 ripiego · 1 illustr. · 0 nessuna");
  await expect(etna.locator('td[data-entity="activity"]')).toContainText("1 foto");
  await expect(page.getByTestId("expiring-authorizations").or(page.getByText("Nessuna autorizzazione in scadenza."))).toBeVisible();
});
