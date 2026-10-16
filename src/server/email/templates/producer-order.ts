import "server-only";
import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/brand";
import { emailUrl, renderEmailLayout, subjectLine, type RenderedEmail } from "../layout";

// Ordine da preparare, inviato al produttore. Nessun dato del cliente: l'email contiene solo
// il numero d'ordine, le righe e la scadenza di spedizione. Nessun invio ancora (passo 7).

export type ProducerOrderLine = {
  name: string;
  quantity: number;
};

export type ProducerOrderEmailInput = {
  locale: string;
  producerName: string;
  orderNumber: string;
  shipBy: string;
  lines: readonly ProducerOrderLine[];
  url: string;
};

export async function renderProducerOrderEmail(input: ProducerOrderEmailInput): Promise<RenderedEmail> {
  const t = await getTranslations({ locale: input.locale, namespace: "Email.producerOrder" });
  const values = { orderNumber: input.orderNumber, shipBy: input.shipBy, brand: BRAND_NAME };

  const body = await renderEmailLayout({
    locale: input.locale,
    preheader: t("preheader", values),
    heading: t("heading"),
    paragraphs: [
      t("greeting", { producerName: input.producerName }),
      t("body", values),
      ...input.lines.map((line) => t("line", { name: line.name, quantity: String(line.quantity) })),
    ],
    cta: { label: t("cta"), url: emailUrl(input.url) },
    footerNote: t("footer", values),
  });

  return { subject: subjectLine(t("subject", values)), html: body.html, text: body.text };
}
