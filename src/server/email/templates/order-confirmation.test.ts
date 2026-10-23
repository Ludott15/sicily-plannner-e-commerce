import { describe, expect, it, vi } from "vitest";
import { renderOrderConfirmationEmail } from "./order-confirmation";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => {
    const t = (key: string, values?: Record<string, string>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`;
    return t;
  },
}));

const url = "https://example.test/it/ordini/123";
const base = {
  locale: "it",
  orderNumber: "ORD-1",
  customerName: "Anna",
  lines: [{ name: "Granita di mandorla", quantity: 2, totalLabel: "12,00 €" }],
  totalLabel: "12,00 €",
  url,
};

describe("renderOrderConfirmationEmail", () => {
  it("oggetto con il numero d'ordine, righe e totale nel testo semplice", async () => {
    const email = await renderOrderConfirmationEmail(base);
    expect(email.subject).toContain("Email.orderConfirmation.subject");
    expect(email.subject).toContain("ORD-1");
    expect(email.text).toContain("Granita di mandorla");
    expect(email.text).toContain("Email.orderConfirmation.total");
  });

  it("CTA con URL https nel pulsante e nel testo semplice", async () => {
    const email = await renderOrderConfirmationEmail(base);
    expect(email.html).toContain(`href="${url}"`);
    expect(email.text).toContain(`Email.orderConfirmation.cta: ${url}`);
  });

  it("escapa il nome del cliente e non scrive campi mancanti", async () => {
    const email = await renderOrderConfirmationEmail({
      ...base,
      customerName: "<script>x</script>",
      lines: [],
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;x&lt;/script&gt;");

    const anonymous = await renderOrderConfirmationEmail({ ...base, customerName: null, lines: [] });
    expect(anonymous.html).toContain("Email.orderConfirmation.greeting");
    expect(anonymous.html).not.toContain("undefined");
    expect(anonymous.text).not.toContain("null");
  });
});
