"use server";

import "server-only";
import { headers } from "next/headers";
import { contactMessageSchema, type ContactMessageInput } from "@/lib/contact";
import { supportEmail } from "@/lib/legal-entity";
import { clientIp } from "@/server/affiliates/rate-key";
import { sendEmail } from "@/server/email/send";
import { renderContactMessageEmail } from "@/server/email/templates/contact-message";
import { verifyTurnstileToken } from "./captcha";
import { checkContactRateLimit } from "./rate-limit";

// Modulo di contatto (passo 8.3). Ordine dei controlli: validazione Zod, Turnstile sul server,
// limite per IP (fail closed), poi l'email all'assistenza con Resend. Nessun dato va nel database.
// Il messaggio non viene mai scritto nei log. Non esistono redirect né input che finiscono in URL.

export type ContactErrorCode = "invalid" | "captcha_failed" | "rate_limited" | "email_unavailable" | "failed";

export type ContactResult = { status: "ok" } | { status: "error"; code: ContactErrorCode };

function fail(code: ContactErrorCode): ContactResult {
  return { status: "error", code };
}

export async function sendContactMessage(input: ContactMessageInput): Promise<ContactResult> {
  const parsed = contactMessageSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const data = parsed.data;

  const ip = clientIp(await headers());

  if (!(await verifyTurnstileToken(data.captchaToken, ip))) return fail("captcha_failed");

  const limit = await checkContactRateLimit(ip);
  if (limit === "limited") return fail("rate_limited");
  if (limit === "unavailable") return fail("failed");

  const to = supportEmail();
  if (!to) return fail("email_unavailable");

  const email = await renderContactMessageEmail({
    topic: data.topic,
    name: data.name,
    email: data.email,
    message: data.message,
  });
  const result = await sendEmail({
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    replyTo: data.email,
  });
  switch (result.status) {
    case "sent":
      return { status: "ok" };
    case "unavailable":
      return fail("email_unavailable");
    case "failed":
      return fail("failed");
  }
}
