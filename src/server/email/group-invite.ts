import "server-only";
import { getTranslations } from "next-intl/server";
import { ogColors as c, ogFamilies } from "@generated/design/og";

// Email di invito a un gruppo (passo 4.1). Testi dal namespace GroupInviteEmail (it ed en),
// colori e famiglie dai token del design (le stesse dell'immagine Open Graph): nessun colore
// scritto a mano. Nessun dato personale oltre al nome di chi invita e del gruppo.

export type GroupInviteEmailInput = {
  groupName: string;
  inviterName: string | null;
  url: string;
  locale: string;
};

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

type HtmlParts = {
  locale: string;
  greeting: string;
  body: string;
  cta: string;
  note: string;
  linkLabel: string;
  footer: string;
  url: string;
};

function buildHtml(p: HtmlParts): string {
  const url = escapeHtml(p.url);
  const line = `font-size:16px;line-height:1.5;color:${c.lava};`;
  const muted = `font-size:13px;line-height:1.5;color:${c["lava-muted"]};`;
  return `<!doctype html>
<html lang="${escapeHtml(p.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:${c.calce};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.calce};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${c["calce-raised"]};border:1px solid ${c.divider};border-radius:16px;padding:32px;font-family:'${ogFamilies.sans}', sans-serif;">
<tr><td style="font-family:'${ogFamilies.display}', serif;font-size:32px;font-weight:600;letter-spacing:-0.5px;color:${c.lava};padding-bottom:16px;">Isula</td></tr>
<tr><td style="${line}">${escapeHtml(p.greeting)}</td></tr>
<tr><td style="${line}padding-top:12px;">${escapeHtml(p.body)}</td></tr>
<tr><td style="padding:24px 0;"><a href="${url}" style="display:inline-block;background:${c.coccio};color:${c["on-coccio"]};text-decoration:none;font-weight:600;font-size:16px;padding:14px 24px;border-radius:999px;">${escapeHtml(p.cta)}</a></td></tr>
<tr><td style="${muted}">${escapeHtml(p.note)}</td></tr>
<tr><td style="${muted}padding-top:12px;">${escapeHtml(p.linkLabel)}<br><a href="${url}" style="color:${c.mare};word-break:break-all;">${url}</a></td></tr>
<tr><td style="${muted}padding-top:24px;border-top:1px solid ${c.divider};">${escapeHtml(p.footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// Testo semplice per i client che non mostrano l'HTML.
function buildText(p: HtmlParts): string {
  return [p.greeting, "", p.body, "", `${p.cta}: ${p.url}`, "", p.note, "", p.linkLabel, p.url, "", p.footer, "", "Isula"].join(
    "\n",
  );
}

export async function renderGroupInviteEmail(input: GroupInviteEmailInput): Promise<RenderedEmail> {
  const t = await getTranslations({ locale: input.locale, namespace: "GroupInviteEmail" });
  const inviter = input.inviterName?.trim() ? input.inviterName.trim() : t("someone");
  const values = { inviter, groupName: input.groupName };

  const parts: HtmlParts = {
    locale: input.locale,
    greeting: t("greeting"),
    body: t("body", values),
    cta: t("cta"),
    note: t("note"),
    linkLabel: t("linkLabel"),
    footer: t("footer", values),
    url: input.url,
  };

  return {
    subject: t("subject", values),
    html: buildHtml(parts),
    text: buildText(parts),
  };
}
