import "server-only";
import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/brand";
import { emailUrl, renderEmailLayout, subjectLine, type RenderedEmail } from "../layout";

// Conferma d'ordine al cliente. Nessun invio: lo richiamerà il flusso degli ordini (passo 7).
// I valori monetari arrivano già formattati dal chiamante.

export type OrderConfirmationLine = {
  name: string;
  quantity: number;
  totalLabel: string;
};

export type OrderConfirmationEmailInput = {
  locale: string;
  orderNumber: string;
  customerName: string | null;
  lines: readonly OrderConfirmationLine[];
  totalLabel: string;
  url: string;
};

export async function renderOrderConfirmationEmail(input: OrderConfirmationEmailInput): Promise<RenderedEmail> {
  const t = await getTranslations({ locale: input.locale, namespace: "Email.orderConfirmation" });
  const values = { orderNumber: input.orderNumber, brand: BRAND_NAME };
  const name = input.customerName?.trim() ?? "";

  const lineParagraphs = input.lines.map((line) =>
    t("line", { name: line.name, quantity: String(line.quantity), total: line.totalLabel }),
  );

  const body = await renderEmailLayout({
    locale: input.locale,
    preheader: t("preheader", values),
    heading: t("heading"),
    paragraphs: [
      name ? t("greetingNamed", { name }) : t("greeting"),
      t("body", values),
      ...lineParagraphs,
      t("total", { total: input.totalLabel }),
    ],
    cta: { label: t("cta"), url: emailUrl(input.url) },
    footerNote: t("footer", values),
  });

  return { subject: subjectLine(t("subject", values)), html: body.html, text: body.text };
}
