import { expect, test } from "@playwright/test";
import { authSettingsProblems, type AuthSettings } from "../src/lib/launch-checks";

// Controllo di lancio (PRE_LAUNCH=1): configurazione di Supabase Auth nel progetto cloud.
// Variabili: LAUNCH_SUPABASE_URL e LAUNCH_SUPABASE_PUBLISHABLE_KEY (progetto di produzione),
// LAUNCH_SITE_URL facoltativa (sito in produzione). Vedi docs/LANCIO.md.

const url = process.env.LAUNCH_SUPABASE_URL;
const key = process.env.LAUNCH_SUPABASE_PUBLISHABLE_KEY;

test.describe("lancio: Supabase Auth in produzione", () => {
  test.skip(process.env.PRE_LAUNCH !== "1", "attivo solo con PRE_LAUNCH=1");

  test("variabili del progetto cloud presenti", () => {
    expect(url, "LAUNCH_SUPABASE_URL").toMatch(/^https:\/\/.+/);
    expect(key, "LAUNCH_SUPABASE_PUBLISHABLE_KEY").toBeTruthy();
  });

  test("/auth/v1/settings: Confirm email, accessi anonimi, email e iscrizioni", async ({ request }) => {
    const res = await request.get(`${url}/auth/v1/settings`, { headers: { apikey: key! } });
    expect(res.ok()).toBe(true);
    const settings = (await res.json()) as AuthSettings;
    expect(settings.mailer_autoconfirm, "mailer_autoconfirm deve essere false").toBe(false);
    expect(authSettingsProblems(settings)).toEqual([]);
  });

  test("CAPTCHA attivo: una sessione anonima senza token è rifiutata", async ({ request }) => {
    const res = await request.post(`${url}/auth/v1/signup`, { headers: { apikey: key! }, data: {} });
    expect(res.status()).toBe(400);
    expect(((await res.json()) as { error_code?: string }).error_code).toBe("captcha_failed");
  });

  test("cron di pulizia non pubblico sul sito in produzione", async ({ request }) => {
    const site = process.env.LAUNCH_SITE_URL;
    test.skip(!site, "LAUNCH_SITE_URL non impostata");
    expect((await request.get(`${site}/api/cron/cleanup-guests`)).status()).toBe(401);
  });
});
