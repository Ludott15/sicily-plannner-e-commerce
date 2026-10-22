import { expect, test } from "@playwright/test";

// Header di sicurezza e salute del sito (passo 11.5). Le pagine portano la CSP con nonce: ogni script
// scritto da Next nell'HTML della pagina ha il nonce dell'intestazione, e il browser non segnala violazioni.
// L'intestazione HSTS compare solo su Vercel in produzione: qui (locale o build CI) non c'è.

const NONCE_RE = /'nonce-([A-Za-z0-9+/=]+)'/;

test.describe("header di sicurezza", () => {
  test("la pagina risponde con CSP con nonce e gli altri header", async ({ request }) => {
    const response = await request.get("/it");
    expect(response.status()).toBe(200);
    const headers = response.headers();

    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://challenges.cloudflare.com");
    expect(csp).toContain("https://tiles.openfreemap.org");

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["permissions-policy"]).toContain("geolocation=(self)");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["strict-transport-security"]).toBeUndefined();
  });

  test("ogni script dell'HTML ha il nonce della CSP e il browser non segnala violazioni", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (/Content Security Policy|Refused to (execute|load|apply|connect)/i.test(text)) violations.push(text);
    });

    // Il nonce è per richiesta: quello della pagina è nell'intestazione della sua risposta di navigazione.
    const document = await page.goto("/it");
    expect(document?.status()).toBe(200);
    const nonce = (document?.headers()["content-security-policy"] ?? "").match(NONCE_RE)?.[1];
    expect(nonce, "nonce nella CSP della pagina").toBeTruthy();

    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Gli script scritti da Next nell'HTML devono avere il nonce. Gli script che il browser aggiunge
    // dopo (in sviluppo, il client di Hot Module Replacement) non sono nell'HTML della risposta.
    const html = (await document?.text()) ?? "";
    const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
    const executable = scriptTags.filter((tag) => !tag.includes('type="application/ld+json"'));
    expect(executable.length).toBeGreaterThan(0);
    for (const tag of executable) {
      expect(tag, `nonce su ${tag.slice(0, 120)}`).toContain(`nonce="${nonce}"`);
    }

    expect(violations).toEqual([]);
  });

  test("/api/health risponde 200 con il database raggiungibile, senza cache", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, db: "ok" });
  });
});
