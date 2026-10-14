import { expect, test } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Import CSV del catalogo: solo admin (404 per gli altri, anche sul modello); anteprima prima di
// salvare; righe nuove inattive e da verificare, luogo nuovo non pubblicato; una riga nel registro;
// "Verificata" toglie l'attività dalla coda.

test("un utente che non è admin non vede import, coda e modello", async ({ page, request }) => {
  await signUpWithCode(page, request);
  for (const path of ["/it/admin/attivita/importa", "/it/admin/attivita/da-verificare"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  const template = await page.request.get("/it/admin/attivita/importa/modello");
  expect(template.status()).toBe(404);
});

test("admin: anteprima, importazione, coda da verificare", async ({ page, request, browser }) => {
  const email = await signUpWithCode(page, request);
  const { withDb } = await import("./db.mjs");
  await withDb((sql) => sql`update profiles set role = 'admin' where id = (select id from auth.users where email = ${email})`);
  const [area] = await withDb((sql) => sql`select slug from areas order by sort limit 1`);

  const stamp = Date.now();
  const newSlug = `e2e-import-${stamp}`;
  const badSlug = `e2e-import-errata-${stamp}`;
  const placeSlug = `e2e-luogo-${stamp}`;
  const csv = [
    "slug;name_it;area_slug;place_slug;place_name;place_province;place_lat;place_lng;duration_min;interests;source_url;notes",
    `${newSlug};e2e- Attività importata;${area!.slug};${placeSlug};e2e- Luogo importato;PA;38,1;13,35;90;"mare:3;storia:2";https://example.com/fonte;e2e- nota interna`,
    `${badSlug};e2e- Riga errata;${area!.slug};${placeSlug};;;;;zero;;;`,
  ].join("\r\n");

  await page.goto("/it/admin/attivita/importa");
  await page.getByLabel("File CSV").setInputFiles({ name: "e2e-catalogo.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Anteprima" }).click();

  const errors = page.getByRole("table", { name: "Righe scartate" });
  await expect(errors).toContainText(badSlug);
  await expect(errors).toContainText("colonna duration_min");
  await expect(page.getByRole("table", { name: "Da creare" })).toContainText(newSlug);

  // L'anteprima non salva nulla.
  const before = await withDb((sql) => sql`select 1 from activities where slug = ${newSlug}`);
  expect(before).toHaveLength(0);

  const commitRequest = page.waitForRequest((r) => r.method() === "POST" && r.headers()["next-action"] !== undefined);
  await page.getByRole("button", { name: "Importa una riga" }).click();
  await expect(page.getByRole("status")).toContainText("create 1, aggiornate 0, scartate 1, luoghi creati 1");

  // La stessa richiesta della server action, rimandata con la sessione di un utente non admin, non scrive nulla.
  const replay = await commitRequest;
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  const otherEmail = await signUpWithCode(otherPage, request);
  const res = await otherPage.request.post(replay.url(), {
    headers: { "next-action": replay.headers()["next-action"]!, "content-type": replay.headers()["content-type"]! },
    data: replay.postDataBuffer()!,
  });
  expect(res.status()).not.toBe(200);
  const otherAudit = await withDb(
    (sql) => sql`
      select 1 from admin_audit_log
      where actor_id = (select id from auth.users where email = ${otherEmail})`,
  );
  expect(otherAudit).toHaveLength(0);
  await other.close();

  const [saved] = await withDb(
    (sql) => sql`
      select a.id, a.is_active, a.needs_review, p.is_active as place_active, p.needs_review as place_review,
        s.source_url, s.notes, (select count(*)::int from activity_interests i where i.activity_id = a.id) as tags
      from activities a
      join places p on p.id = a.place_id
      left join activity_sources s on s.activity_id = a.id
      where a.slug = ${newSlug}`,
  );
  expect(saved).toMatchObject({
    is_active: false,
    needs_review: true,
    place_active: false,
    place_review: true,
    source_url: "https://example.com/fonte",
    notes: "e2e- nota interna",
    tags: 2,
  });
  expect((await request.get(`/it/luoghi/${placeSlug}`)).status()).toBe(404);

  const audit = await withDb(
    (sql) => sql`
      select l.diff from admin_audit_log l
      where l.action = 'catalog.import' and l.actor_id = (select id from auth.users where email = ${email})`,
  );
  expect(audit).toHaveLength(1);
  expect(audit[0]!.diff).toMatchObject({ created: [newSlug], updated: [], places_created: [placeSlug] });

  // Coda: l'attività c'è, con il luogo da verificare; "Verificata" la toglie.
  await page.goto("/it/admin/attivita/da-verificare?manca=coordinate");
  const row = page.getByRole("row").filter({ hasText: "e2e- Attività importata" });
  await expect(row).toContainText("Luogo da verificare");
  await row.getByRole("button", { name: "Verificata" }).click();
  await expect(page.getByRole("row").filter({ hasText: "e2e- Attività importata" })).toHaveCount(0);
  const [verified] = await withDb((sql) => sql`select needs_review from activities where slug = ${newSlug}`);
  expect(verified!.needs_review).toBe(false);
});
