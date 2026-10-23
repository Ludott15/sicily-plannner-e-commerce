import "server-only";
import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/brand";
import { emailUrl, renderEmailLayout, subjectLine, type RenderedEmail } from "../layout";

// Promemoria del viaggio salvato. Nessun invio ancora: lo chiamerà il flusso dei promemoria.
// Le tappe compaiono in ordine, numerate; senza tappe la sezione non c'è.

export type TripReminderEmailInput = {
  locale: string;
  tripName: string;
  startDate: string;
  stops: readonly string[];
  url: string;
};

export async function renderTripReminderEmail(input: TripReminderEmailInput): Promise<RenderedEmail> {
  const t = await getTranslations({ locale: input.locale, namespace: "Email.tripReminder" });
  const values = { tripName: input.tripName, startDate: input.startDate, brand: BRAND_NAME };

  const stopParagraphs = input.stops.map((name, index) => t("stop", { index: String(index + 1), name }));

  const body = await renderEmailLayout({
    locale: input.locale,
    preheader: t("preheader", values),
    heading: t("heading", values),
    paragraphs: [
      t("greeting"),
      t("body", values),
      ...(stopParagraphs.length > 0 ? [t("stopsLabel"), ...stopParagraphs] : []),
    ],
    cta: { label: t("cta"), url: emailUrl(input.url) },
    footerNote: t("footer", values),
  });

  return { subject: subjectLine(t("subject", values)), html: body.html, text: body.text };
}
