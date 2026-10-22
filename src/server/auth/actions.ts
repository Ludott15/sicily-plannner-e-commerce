"use server";

import type { AuthError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { routing } from "@/lib/i18n/routing";
import { getUser } from "@/server/auth";
import { safeNextPath } from "@/server/auth/redirect";
import { createClient } from "@/server/supabase/server";
import { AUTH_RULES, checkRates, ipIdentity, type RateCheck } from "@/server/security/rate-limit";

// Accesso (docs/spec.md, "Accesso, ospiti e browser interni"):
// - codice a 6 cifre via email, digitato nella stessa pagina; il link nell'email resta come
//   alternativa (stesso template);
// - ospite: sessione anonima protetta da Turnstile;
// - da ospite ad account: updateUser con l'email e verifica del codice, stesso user id.
// Il CAPTCHA serve all'invio del codice e alla sessione anonima; la verifica del codice e
// il cambio email dell'ospite (già in sessione) non lo richiedono.

const localeSchema = z.enum(routing.locales);
const emailSchema = z.email().max(254);
const codeSchema = z.string().regex(/^\d{6}$/);
const captchaSchema = z.string().min(1).max(4096);
// Destinazione dopo l'accesso (per es. /it/invito/<token>): validata con safeNextPath, mai usata grezza.
const nextSchema = z.string().max(2048).optional();

// Gli input arrivano dal client come stringhe: li valida Zod.

export type AuthErrorCode =
  | "invalid_email"
  | "invalid_code"
  | "captcha_failed"
  | "rate_limited"
  | "email_taken"
  | "not_guest"
  | "failed";

export type SendCodeState = { status: "sent"; email: string } | { status: "error"; code: AuthErrorCode };
export type VerifyCodeState = { status: "error"; code: AuthErrorCode };

// Limiti degli accessi (passo 11.5): per IP e per email, nell'ordine della regola più stretta. Un
// contatore non disponibile nega (fail closed): meglio un accesso rimandato che un codice senza limite.
async function accessLimit(checks: RateCheck[]): Promise<AuthErrorCode | null> {
  const decision = await checkRates(checks);
  if (decision === "allowed") return null;
  return decision === "limited" ? "rate_limited" : "failed";
}

// Il limite per IP vale solo con un IP noto (su Vercel c'è sempre).
async function ipChecks(rule: RateCheck["rule"]): Promise<RateCheck[]> {
  const ip = ipIdentity(await headers());
  return ip === null ? [] : [{ rule, identity: ip }];
}

async function sendLimit(email: string): Promise<AuthErrorCode | null> {
  return accessLimit([
    ...(await ipChecks(AUTH_RULES.sendCodeIp)),
    { rule: AUTH_RULES.sendCodeEmail, identity: email.toLowerCase() },
  ]);
}

async function verifyLimit(email: string): Promise<AuthErrorCode | null> {
  return accessLimit([
    ...(await ipChecks(AUTH_RULES.verifyIp)),
    { rule: AUTH_RULES.verifyEmail, identity: email.toLowerCase() },
  ]);
}

function mapAuthError(error: AuthError): AuthErrorCode {
  switch (error.code) {
    case "captcha_failed":
      return "captcha_failed";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "rate_limited";
    case "email_exists":
      return "email_taken";
    case "email_address_invalid":
    case "validation_failed":
      return "invalid_email";
    default:
      return "failed";
  }
}

// Destinazione dopo l'accesso: il percorso ricevuto se è interno, altrimenti il profilo.
function destinationAfterAuth(locale: string, next: string | undefined): string {
  return safeNextPath(next, `/${locale}/profilo`);
}

function callbackUrl(locale: string, next?: string) {
  const url = new URL("/api/auth/callback", publicEnv.NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("next", destinationAfterAuth(locale, next));
  return url.toString();
}

const sendCodeSchema = z.object({
  email: emailSchema,
  locale: localeSchema,
  captchaToken: captchaSchema,
  next: nextSchema,
});

// Invia il codice (e il link alternativo). Crea l'account se l'email è nuova.
export async function sendEmailCode(input: {
  email: string;
  locale: string;
  captchaToken: string;
  next?: string;
}): Promise<SendCodeState> {
  const parsed = sendCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", code: parsed.error.issues.some((i) => i.path[0] === "email") ? "invalid_email" : "captcha_failed" };
  }

  const limit = await sendLimit(parsed.data.email);
  if (limit) return { status: "error", code: limit };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: callbackUrl(parsed.data.locale, parsed.data.next),
      captchaToken: parsed.data.captchaToken,
      shouldCreateUser: true,
    },
  });
  if (error) return { status: "error", code: mapAuthError(error) };
  return { status: "sent", email: parsed.data.email };
}

const verifyCodeSchema = z.object({ email: emailSchema, code: codeSchema, locale: localeSchema, next: nextSchema });

// Verifica il codice dell'accesso e porta alla destinazione (next, altrimenti il profilo).
export async function verifyEmailCode(input: {
  email: string;
  code: string;
  locale: string;
  next?: string;
}): Promise<VerifyCodeState> {
  const parsed = verifyCodeSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid_code" };

  const limit = await verifyLimit(parsed.data.email);
  if (limit) return { status: "error", code: limit };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: "email" });
  // Supabase risponde otp_expired sia al codice sbagliato sia a quello scaduto.
  if (error) return { status: "error", code: "invalid_code" };

  redirect(destinationAfterAuth(parsed.data.locale, parsed.data.next));
}

const guestSchema = z.object({ locale: localeSchema, captchaToken: captchaSchema, next: nextSchema });

// Sessione ospite: l'utente usa il sito senza account. Se c'è già una sessione, non ne crea un'altra.
export async function startGuestSession(input: { locale: string; captchaToken: string; next?: string }): Promise<VerifyCodeState> {
  const parsed = guestSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "captcha_failed" };
  const destination = safeNextPath(parsed.data.next, `/${parsed.data.locale}/profilo`);

  if (!(await getUser())) {
    const limit = await accessLimit(await ipChecks(AUTH_RULES.guestIp));
    if (limit) return { status: "error", code: limit };
    const supabase = await createClient();
    const { error } = await supabase.auth.signInAnonymously({ options: { captchaToken: parsed.data.captchaToken } });
    if (error) return { status: "error", code: mapAuthError(error) };
  }

  redirect(destination);
}

const guestEmailSchema = z.object({ email: emailSchema, locale: localeSchema, next: nextSchema });

// Da ospite ad account, passo 1: l'email riceve il codice. L'account non cambia finché il
// codice non è verificato. Il locale serve al link alternativo dell'email (emailRedirectTo).
export async function sendGuestEmailCode(input: {
  email: string;
  locale: string;
  next?: string;
}): Promise<SendCodeState> {
  const parsed = guestEmailSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid_email" };

  const user = await getUser();
  if (!user?.is_anonymous) return { status: "error", code: "not_guest" };
  const limit = await sendLimit(parsed.data.email);
  if (limit) return { status: "error", code: limit };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    { emailRedirectTo: callbackUrl(parsed.data.locale, parsed.data.next) },
  );
  if (error) return { status: "error", code: mapAuthError(error) };
  return { status: "sent", email: parsed.data.email };
}

const guestVerifySchema = z.object({ email: emailSchema, code: codeSchema, locale: localeSchema, next: nextSchema });

// Da ospite ad account, passo 2: con il codice l'email è confermata e l'utente non è più
// anonimo. Lo user id resta lo stesso, quindi itinerari e dati restano suoi.
export async function verifyGuestEmailCode(input: {
  email: string;
  code: string;
  locale: string;
  next?: string;
}): Promise<VerifyCodeState> {
  const parsed = guestVerifySchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid_code" };

  const user = await getUser();
  if (!user?.is_anonymous) return { status: "error", code: "not_guest" };
  const limit = await verifyLimit(parsed.data.email);
  if (limit) return { status: "error", code: limit };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.code,
    type: "email_change",
  });
  if (error) return { status: "error", code: "invalid_code" };

  redirect(destinationAfterAuth(parsed.data.locale, parsed.data.next));
}

export async function signInWithGoogle(formData: FormData) {
  const locale = localeSchema.parse(formData.get("locale"));
  // next (facoltativo) è validato da safeNextPath dentro callbackUrl.
  const rawNext = formData.get("next");
  const next = typeof rawNext === "string" ? rawNext : undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(locale, next) },
  });
  if (error || !data.url) redirect(`/${locale}/login?error=oauth`);

  redirect(data.url);
}

export async function signOut(formData: FormData) {
  const locale = localeSchema.catch(routing.defaultLocale).parse(formData.get("locale"));

  const supabase = await createClient();
  await supabase.auth.signOut();

  // Il layout si ricalcola: il service worker riceve la sessione vuota e svuota le pagine dei viaggi (passo 11.3).
  revalidatePath("/", "layout");

  redirect(`/${locale}`);
}
