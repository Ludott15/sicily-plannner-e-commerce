import "server-only";
import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/brand";
import { emailUrl, renderEmailLayout, subjectLine, type RenderedEmail } from "../layout";

// Email di spedizione al cliente. Nessun invio: la chiamerà il flusso delle spedizioni (passo 7).
// Le righe facoltative (tracciamento, arrivo previsto) compaiono solo se il dato è passato.

export type ShippingEmailInput = {
  locale: string;
  orderNumber: string;
  carrier: string;
  trackingCode: string | null;
  estimatedDate: string | null;
  url: string;
};

export async function renderShippingEmail(input: ShippingEmailInput): Promise<RenderedEmail> {
  const t = await getTranslations({ locale: input.locale, namespace: "Email.shipping" });
  const values = { orderNumber: input.orderNumber, carrier: input.carrier, brand: BRAND_NAME };

  const paragraphs = [t("greeting"), t("body", values)];
  const trackingCode = input.trackingCode?.trim() ?? "";
  if (trackingCode) paragraphs.push(t("tracking", { code: trackingCode }));
  const estimatedDate = input.estimatedDate?.trim() ?? "";
  if (estimatedDate) paragraphs.push(t("eta", { date: estimatedDate }));

  const body = await renderEmailLayout({
    locale: input.locale,
    preheader: t("preheader", values),
    heading: t("heading"),
    paragraphs,
    cta: { label: t("cta"), url: emailUrl(input.url) },
    footerNote: t("footer", values),
  });

  return { subject: subjectLine(t("subject", values)), html: body.html, text: body.text };
}
