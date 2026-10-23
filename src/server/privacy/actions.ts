"use server";

import type { AuthError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CONSENT_KINDS } from "@/lib/consents";
import { routing } from "@/lib/i18n/routing";
import { requireUser } from "@/server/auth";
import { pgErrorMessage, matchCode } from "@/server/gamification/pg";
import { createClient } from "@/server/supabase/server";
import { deleteConfirmationFor, GUEST_DELETE_DAILY_LIMIT, EXPORT_WINDOW_SECONDS } from "./config";
import { setConsent, withdrawConsent } from "./consents";
import { eraseAccount } from "./erase";
import { userQuotaAllowed } from "./quota";

// Area Privacy (passo 8.2): Zod → utente (requireUser, mai dall'input) → scrittura. Il contratto è
// { status: "ok" } oppure { status: "error", code }. Nei messaggi non compaiono mai dati personali.
// Il download dei dati è una route (src/app/api/account/export/route.ts), non un'azione.

export type PrivacyErrorCode =
  | "invalid"
  | "guest_not_allowed"
  | "not_applicable"
  | "wrong_confirmation"
  | "invalid_code"
  | "captcha_failed"
  | "rate_limited"
  | "failed";

export type PrivacyActionResult = { status: "ok" } | { status: "error"; code: PrivacyErrorCode };

function failure(code: PrivacyErrorCode): PrivacyActionResult {
  return { status: "error", code };
}

function authFailure(error: AuthError): PrivacyActionResult {
  switch (error.code) {
    case "captcha_failed":
      return failure("captcha_failed");
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return failure("rate_limited");
    default:
      return failure("failed");
  }
}

const DOMAIN_CODES = ["guest_not_allowed"] as const;

const consentSchema = z.object({
  kind: z.enum(CONSENT_KINDS),
  granted: z.boolean(),
});

// Scelta di un consenso dalla pagina Privacy (la profilazione anche dall'onboarding, in
// submitOnboarding). Il registro conserva la versione del testo che la persona ha visto.
export async function recordConsentAction(input: { kind: string; granted: boolean }): Promise<PrivacyActionResult> {
  const parsed = consentSchema.safeParse(input);
  if (!parsed.success) return failure("invalid");
  const user = await requireUser();
  try {
    await setConsent(user, parsed.data.kind, parsed.data.granted);
  } catch (error) {
    return failure(matchCode(pgErrorMessage(error), DOMAIN_CODES) === "guest_not_allowed" ? "guest_not_allowed" : "failed");
  }
  revalidatePath("/", "layout");
  return { status: "ok" };
}

const sendCodeSchema = z.object({
  captchaToken: z.string().min(1).max(4096),
});

// Eliminazione dell'account, passo 1: invia il codice all'email dell'account. Il CAPTCHA è
// obbligatorio perché la chiamata a Supabase passa dal CAPTCHA del progetto (auth.captcha).
export async function sendDeleteAccountCode(input: { captchaToken: string }): Promise<PrivacyActionResult> {
  const parsed = sendCodeSchema.safeParse(input);
  if (!parsed.success) return failure("captcha_failed");
  const user = await requireUser();
  if (user.is_anonymous || !user.email) return failure("not_applicable");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false, captchaToken: parsed.data.captchaToken },
  });
  if (error) return authFailure(error);
  return { status: "ok" };
}

const deleteAccountSchema = z.object({
  locale: z.enum(routing.locales),
  confirmation: z.string().max(20),
  code: z.string().regex(/^\d{6}$/),
});

// Eliminazione dell'account, passo 2: frase di conferma e codice email (verificato sul server con
// verifyOtp, tipo email). Solo per gli account con email; gli ospiti usano deleteGuestData.
export async function deleteAccount(input: {
  locale: string;
  confirmation: string;
  code: string;
}): Promise<PrivacyActionResult> {
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) return failure("invalid");
  const user = await requireUser();
  if (user.is_anonymous || !user.email) return failure("not_applicable");
  if (parsed.data.confirmation !== deleteConfirmationFor(parsed.data.locale)) return failure("wrong_confirmation");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: user.email, token: parsed.data.code, type: "email" });
  if (error) return failure("invalid_code");

  try {
    await eraseAccount(user);
  } catch {
    return failure("failed");
  }
  revalidatePath("/", "layout");
  return { status: "ok" };
}

const deleteGuestSchema = z.object({
  locale: z.enum(routing.locales),
  confirmation: z.string().max(20),
});

// Ospite: "Elimina i dati dell'ospite". Nessun codice (non ha email), ma la frase di conferma sì.
export async function deleteGuestData(input: {
  locale: string;
  confirmation: string;
}): Promise<PrivacyActionResult> {
  const parsed = deleteGuestSchema.safeParse(input);
  if (!parsed.success) return failure("invalid");
  const user = await requireUser();
  if (!user.is_anonymous) return failure("not_applicable");
  if (parsed.data.confirmation !== deleteConfirmationFor(parsed.data.locale)) return failure("wrong_confirmation");
  // Limite per utente (fail closed): la cancellazione dell'ospite non è senza freni.
  if (!(await userQuotaAllowed(user, "guest-delete", GUEST_DELETE_DAILY_LIMIT, EXPORT_WINDOW_SECONDS))) {
    return failure("rate_limited");
  }

  try {
    await eraseAccount(user);
  } catch {
    return failure("failed");
  }
  revalidatePath("/", "layout");
  return { status: "ok" };
}

const withdrawSchema = z.object({ kind: z.enum(CONSENT_KINDS) });

// Ritiro di un consenso concesso (non registra nulla se non era concesso).
export async function withdrawConsentAction(input: { kind: string }): Promise<PrivacyActionResult> {
  const parsed = withdrawSchema.safeParse(input);
  if (!parsed.success) return failure("invalid");
  const user = await requireUser();
  try {
    await withdrawConsent(user, parsed.data.kind);
  } catch {
    return failure("failed");
  }
  revalidatePath("/", "layout");
  return { status: "ok" };
}
