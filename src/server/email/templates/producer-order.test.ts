import { describe, expect, it, vi } from "vitest";
import { renderProducerOrderEmail } from "./producer-order";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => {
    const t = (key: string, values?: Record<string, string>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`;
    return t;
  },
}));

const url = "https://example.test/produttore/ordini/7";
const base = {
  locale: "it",
  producerName: "Frantoio <Iblei>",
  orderNumber: "ORD-7",
  shipBy: "martedì 6 ottobre",
  lines: [{ name: "Pistacchio di Bronte", quantity: 3 }],
  url,
};

describe("renderProducerOrderEmail", () => {
  it("oggetto con numero d'ordine e scadenza, righe nel testo semplice", async () => {
    const email = await renderProducerOrderEmail(base);
    expect(email.subject).toContain("Email.producerOrder.subject");
    expect(email.subject).toContain("martedì 6 ottobre");
    expect(email.text).toContain("Email.producerOrder.line");
    expect(email.text).toContain("Pistacchio di Bronte");
  });

  it("CTA con URL https e nome del produttore escapato", async () => {
    const email = await renderProducerOrderEmail(base);
    expect(email.html).toContain(`href="${url}"`);
    expect(email.html).toContain("Frantoio &lt;Iblei&gt;");
    expect(email.text).toContain(`Email.producerOrder.cta: ${url}`);
  });

  it("non include dati del cliente: il payload non ha campi per loro", async () => {
    const email = await renderProducerOrderEmail(base);
    expect(email.html).not.toContain("undefined");
    expect(email.text).not.toContain("null");
  });
});
