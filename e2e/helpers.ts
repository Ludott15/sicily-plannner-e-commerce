import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Mailpit raccoglie le email di Supabase locale.
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";

type MailpitMessage = { ID: string; Subject: string };

// Email e2e-…@example.com: la pulizia globale elimina i loro utenti.
export function testEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

// Ultima email ricevuta dall'indirizzo, più recente di `after` (id di un messaggio già visto).
async function latestMessage(request: APIRequestContext, email: string, after?: string) {
  const search = await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:${email}` } });
  const { messages } = (await search.json()) as { messages: MailpitMessage[] };
  const first = messages[0];
  return first && first.ID !== after ? first : undefined;
}

export async function lastMessageId(request: APIRequestContext, email: string) {
  return (await latestMessage(request, email))?.ID;
}

// Il codice a 6 cifre sta nell'oggetto dell'email ("Il tuo codice Isula: 123456").
export async function waitForCode(request: APIRequestContext, email: string, after?: string) {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        code = (await latestMessage(request, email, after))?.Subject.match(/\b(\d{6})\b/)?.[1];
        return code;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  return code!;
}

// Il link alternativo al codice, nella stessa email.
export async function waitForMagicLink(request: APIRequestContext, email: string) {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const first = await latestMessage(request, email);
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

// Chiede il codice dalla pagina di accesso (il bottone si attiva quando Turnstile ha dato il token).
export async function requestLoginCode(page: Page, email: string) {
  await page.goto("/it/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Mandami il codice" }).click();
  await expect(page.getByRole("status")).toContainText(email);
}

// Accesso con codice di un nuovo utente e2e-…@example.com.
export async function signUpWithCode(page: Page, request: APIRequestContext, prefix = "e2e") {
  const email = testEmail(prefix);
  await requestLoginCode(page, email);
  await page.getByLabel("Codice di 6 cifre").fill(await waitForCode(request, email));
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(page).toHaveURL(/\/it\/profilo$/);
  return email;
}

// Id dell'utente della sessione, dal cookie di Supabase (sb-<ref>-auth-token, eventualmente
// diviso in .0, .1…; valore "base64-<json>").
export async function sessionUserId(page: Page) {
  const cookies = (await page.context().cookies()).filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name));
  cookies.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const raw = cookies.map((c) => c.value).join("");
  const json = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64url").toString("utf8") : raw;
  const session = JSON.parse(json) as { user: { id: string } };
  return session.user.id;
}
