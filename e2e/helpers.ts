import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Mailpit raccoglie le email di Supabase locale.
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";

export async function waitForMagicLink(request: APIRequestContext, email: string) {
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

// Accesso con magic link di un nuovo utente e2e-…@example.com (lo elimina la pulizia globale).
export async function signUpWithMagicLink(page: Page, request: APIRequestContext, prefix = "e2e") {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/it/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Inviami il link" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  await page.goto(await waitForMagicLink(request, email));
  await expect(page).toHaveURL(/\/it\/profilo$/);
  return email;
}
