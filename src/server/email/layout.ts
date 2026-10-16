import "server-only";
import { getTranslations } from "next-intl/server";
import { ogColors as c, ogFamilies } from "@generated/design/og";
import { BRAND_NAME } from "@/lib/brand";

// Layout comune di tutte le email transazionali (passo 6.3). HTML a tabelle con stili inline,
// larghezza 600, solo tema chiaro, logotipo testuale. I colori arrivano dai token (og.ts); i font
// web non si caricano nei client di posta, quindi la pila ha fallback di sistema. Ogni valore
// passa da escapeHtml. Il testo semplice è costruito dalle stesse parti.

export type EmailCta = { label: string; url: string };

export type EmailLayoutInput = {
  locale: string;
  preheader: string;
  heading: string;
  paragraphs: readonly string[];
  cta?: EmailCta;
  footerNote: string;
};

export type EmailBody = { html: string; text: string };

export type RenderedEmail = { subject: string; html: string; text: string };

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

// Oggetto su una riga: niente a capo nelle intestazioni.
export function subjectLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// I link nelle email sono https; http solo verso localhost in sviluppo. Gli altri schemi
// (javascript:, data:) vengono rifiutati.
export function emailUrl(value: string): string {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url.href;
  throw new Error("email_url_not_https");
}

const FONT_DISPLAY = `'${ogFamilies.display}', ui-serif, serif`;
const FONT_SANS = `'${ogFamilies.sans}', system-ui, sans-serif`;

function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT_SANS};font-size:16px;line-height:1.5;color:${c.lava};">${escapeHtml(text)}</p>`;
}

function ctaHtml(cta: EmailCta): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;"><tr><td style="border-radius:999px;background:${c.coccio};"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 24px;border-radius:999px;font-family:${FONT_SANS};font-size:16px;font-weight:600;line-height:1.2;color:${c["on-coccio"]};text-decoration:none;">${escapeHtml(cta.label)}</a></td></tr></table>`;
}

export async function renderEmailLayout(input: EmailLayoutInput): Promise<EmailBody> {
  const t = await getTranslations({ locale: input.locale, namespace: "Email.layout" });
  const tagline = t("tagline");
  const linkFallback = t("linkFallback");
  const cta = input.cta ? { label: input.cta.label, url: emailUrl(input.cta.url) } : null;

  const fallbackHtml = cta
    ? `<p style="margin:0 0 16px;font-family:${FONT_SANS};font-size:13px;line-height:1.5;color:${c["lava-muted"]};">${escapeHtml(linkFallback)}<br><a href="${escapeHtml(cta.url)}" style="color:${c["coccio-text"]};word-break:break-all;">${escapeHtml(cta.url)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="${escapeHtml(input.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${c.calce};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.calce};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td style="padding:0 8px 24px;font-family:${FONT_DISPLAY};font-size:28px;font-weight:600;line-height:1;color:${c.lava};">${escapeHtml(BRAND_NAME)}</td></tr>
<tr><td style="background:${c["calce-raised"]};border:1px solid ${c.divider};border-radius:16px;padding:32px;">
<h1 style="margin:0 0 16px;font-family:${FONT_DISPLAY};font-size:24px;font-weight:600;line-height:1.25;color:${c.lava};">${escapeHtml(input.heading)}</h1>
${input.paragraphs.map(paragraphHtml).join("\n")}
${cta ? ctaHtml(cta) : ""}
${fallbackHtml}
</td></tr>
<tr><td style="padding:24px 8px 0;font-family:${FONT_SANS};font-size:13px;line-height:1.5;color:${c["lava-muted"]};">${escapeHtml(input.footerNote)}<br>${escapeHtml(BRAND_NAME)}: ${escapeHtml(tagline)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

  const text = [
    BRAND_NAME,
    "",
    input.heading,
    "",
    ...input.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(cta ? [`${cta.label}: ${cta.url}`, ""] : []),
    input.footerNote,
    "",
    `${BRAND_NAME}: ${tagline}`,
  ].join("\n");

  return { html, text };
}
