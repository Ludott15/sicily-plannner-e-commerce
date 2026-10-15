import { expect, test } from "@playwright/test";
import { signUpWithCode } from "./helpers";

// Alloggi, noleggi e affiliazioni (passo 3.1). Il redirect e il tracciamento sono percorsi
// sensibili: qui si prova a rovescio (firma alterata, host, rate limit) senza ID dei partner in CI.

test("/api/go/v: firma alterata o parametri mancanti → 400, mai un redirect verso il partner", async ({ request }) => {
  const forged = await request.get(
    "/api/go/v?partner=booking&vertical=lodging&query=Palermo&airport=&checkin=2027-05-01&checkout=2027-05-03&adults=2&c=page&i=&exp=4102444800&sig=0000000000000000000000000000000000000000000000000000000000000000",
    { maxRedirects: 0 },
  );
  expect(forged.status()).toBe(400);
  expect(forged.headers()["location"]).toBeUndefined();

  const missing = await request.get("/api/go/v?partner=booking", { maxRedirects: 0 });
  expect(missing.status()).toBe(400);
  expect(missing.headers()["location"]).toBeUndefined();
});

test("/it/link-affiliati → 308 a /it/affiliazioni", async ({ request }) => {
  const res = await request.get("/it/link-affiliati", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toMatch(/\/it\/affiliazioni$/);
});

test("dove-dormire e noleggio-auto senza ID dei partner: stato in arrivo, nessun form", async ({ page }) => {
  await page.goto("/it/dove-dormire");
  await expect(page.getByText("In arrivo", { exact: true })).toBeVisible();
  await expect(page.locator('[data-pending-id="vertical.lodging"]')).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("form[method='get'] select#luogo")).toHaveCount(0);

  await page.goto("/it/noleggio-auto");
  await expect(page.getByText("In arrivo", { exact: true })).toBeVisible();
  await expect(page.locator('[data-pending-id="vertical.car"]')).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("form[method='get'] select#aeroporto")).toHaveCount(0);
});

test("dove-dormire con avviso di link non disponibile mostra il messaggio", async ({ page }) => {
  await page.goto("/it/dove-dormire?avviso=non-disponibile");
  // Next ha il suo annunciatore delle rotte con role="alert": si filtra sul messaggio.
  await expect(page.getByRole("alert").filter({ hasText: "Questo collegamento non è disponibile" })).toBeVisible();
});

test("pagine admin dei partner: un utente che non è admin riceve 404", async ({ page, request }) => {
  await signUpWithCode(page, request);
  const res = await page.goto("/it/admin/partner");
  expect(res?.status()).toBe(404);
});

test("rate limit: al terzo colpo nella finestra la funzione dice no", async () => {
  const { withDb } = await import("./db.mjs");
  const bucket = `e2e-rate-${Date.now()}`;
  const results = await withDb(
    (sql) => sql`
      select
        public.hit_rate_limit(${bucket}, 2, 60) as first,
        public.hit_rate_limit(${bucket}, 2, 60) as second,
        public.hit_rate_limit(${bucket}, 2, 60) as third
    `,
  );
  expect(results[0]).toEqual({ first: true, second: true, third: false });
});
