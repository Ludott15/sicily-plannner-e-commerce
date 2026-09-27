import { expect, test, type APIRequestContext } from "@playwright/test";

// Mailpit raccoglie le email di Supabase locale.
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";

async function waitForMagicLink(request: APIRequestContext, email: string) {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
          params: { query: `to:${email}` },
        });
        const { messages } = (await search.json()) as { messages: { ID: string }[] };
        const first = messages[0];
        if (!first) return undefined;

        const message = await request.get(`${MAILPIT_URL}/api/v1/message/${first.ID}`);
        const { HTML } = (await message.json()) as { HTML: string };
        link = HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
        return link;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  return link!;
}

test("login con magic link, profilo protetto e logout", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.com`;

  // Senza sessione il profilo rimanda al login.
  await page.goto("/it/profilo");
  await expect(page).toHaveURL(/\/it\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Inviami il link" }).click();
  await expect(page.getByRole("status")).toContainText(email);

  await page.goto(await waitForMagicLink(request, email));
  await expect(page).toHaveURL(/\/it\/profilo$/);
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/it$/);
  await expect(page.getByRole("link", { name: "Accedi" })).toBeVisible();

  await page.goto("/it/profilo");
  await expect(page).toHaveURL(/\/it\/login$/);
});

test("il callback rifiuta redirect esterni", async ({ page }) => {
  await page.goto("/api/auth/callback?next=//evil.com");
  await expect(page).toHaveURL(/localhost:3000\/it\/login\?error=callback$/);
});
