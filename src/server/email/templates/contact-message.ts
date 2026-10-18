import "server-only";
import { getTranslations } from "next-intl/server";
import type { ContactTopic } from "@/lib/contact";
import { renderEmailLayout, subjectLine, type RenderedEmail } from "../layout";

// Email all'assistenza con un messaggio del modulo di contatto (passo 8.3). Il testo del
// messaggio è dell'utente: entra nel corpo solo dopo escapeHtml (dentro renderEmailLayout), con
// i suoi a capo convertiti in paragrafi. La lingua è quella dell'assistenza (it), non quella
// dell'utente. Nessun dato oltre a nome, email, argomento e testo.

export type ContactMessageEmailInput = {
  topic: ContactTopic;
  name: string | null;
  email: string;
  message: string;
};

// Righe non vuote del messaggio: un paragrafo per riga.
export function messageParagraphs(message: string): string[] {
  return message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function renderContactMessageEmail(input: ContactMessageEmailInput): Promise<RenderedEmail> {
  const t = await getTranslations({ locale: "it", namespace: "Email.contactMessage" });
  const topic = t(`topics.${input.topic}`);
  const from = t("from", { name: input.name ?? t("unnamed"), email: input.email });

  const body = await renderEmailLayout({
    locale: "it",
    preheader: t("preheader"),
    heading: t("heading"),
    paragraphs: [t("topic", { topic }), from, ...messageParagraphs(input.message)],
    footerNote: t("footer"),
  });

  return { subject: subjectLine(t("subject", { topic })), html: body.html, text: body.text };
}
