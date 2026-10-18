import "server-only";
import { Resend } from "resend";

// Invio delle email transazionali (inviti ai gruppi) con Resend. Solo sul server.
// Senza RESEND_API_KEY o EMAIL_FROM l'invio non è disponibile: nessuna email, nessun errore
// non gestito. Gli indirizzi e il contenuto non entrano mai nei log.

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Indirizzo a cui rispondere, se diverso dal mittente (modulo di contatto).
  replyTo?: string;
};

export type EmailSendResult = { status: "sent" } | { status: "unavailable" } | { status: "failed" };

type EmailConfig = { apiKey: string; from: string };

// Un valore vuoto (o di soli spazi) vale come assente.
export function emailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export function emailConfigured(): boolean {
  return emailConfig() !== null;
}

export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const config = emailConfig();
  if (!config) return { status: "unavailable" };
  try {
    const resend = new Resend(config.apiKey);
    const { error } = await resend.emails.send({
      from: config.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    return error ? { status: "failed" } : { status: "sent" };
  } catch {
    return { status: "failed" };
  }
}
