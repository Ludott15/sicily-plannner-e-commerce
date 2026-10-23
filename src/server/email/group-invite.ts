import "server-only";
import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/brand";
import { emailUrl, renderEmailLayout, subjectLine, type RenderedEmail } from "./layout";

// Email di invito a un gruppo (passo 4.1, riscritta sul layout comune del passo 6.3).
// Testi dal namespace Email.groupInvite (it ed en); aspetto dal layout. Nessun dato personale
// oltre al nome di chi invita e del gruppo.

export { escapeHtml, type RenderedEmail } from "./layout";

export type GroupInviteEmailInput = {
  groupName: string;
  inviterName: string | null;
  url: string;
  locale: string;
};

export async function renderGroupInviteEmail(input: GroupInviteEmailInput): Promise<RenderedEmail> {
  const t = await getTranslations({ locale: input.locale, namespace: "Email.groupInvite" });
  const inviter = input.inviterName?.trim() ? input.inviterName.trim() : t("someone");
  const values = { inviter, groupName: input.groupName, brand: BRAND_NAME };

  const body = await renderEmailLayout({
    locale: input.locale,
    preheader: t("preheader"),
    heading: t("heading", values),
    paragraphs: [t("greeting"), t("body", values)],
    cta: { label: t("cta"), url: emailUrl(input.url) },
    footerNote: `${t("note")} ${t("footer", values)}`,
  });

  return { subject: subjectLine(t("subject", values)), html: body.html, text: body.text };
}
