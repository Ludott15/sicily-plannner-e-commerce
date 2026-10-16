import { describe, expect, it, vi } from "vitest";
import { renderShippingEmail } from "./shipping";

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
  carrier: "Corriere <Sud>",
  trackingCode: "TRK-9",
  estimatedDate: "lunedì 5 ottobre",
  url,
};

describe("renderShippingEmail", () => {
  it("mostra tracciamento e arrivo previsto quando sono passati", async () => {
    const email = await renderShippingEmail(base);
    expect(email.subject).toContain("Email.shipping.subject");
    expect(email.text).toContain("Email.shipping.tracking");
    expect(email.text).toContain("TRK-9");
    expect(email.text).toContain("Email.shipping.eta");
  });

  it("non scrive le righe facoltative se il dato manca", async () => {
    const email = await renderShippingEmail({ ...base, trackingCode: null, estimatedDate: "  " });
    expect(email.text).not.toContain("Email.shipping.tracking");
    expect(email.text).not.toContain("Email.shipping.eta");
    expect(email.html).not.toContain("undefined");
  });

  it("escapa il corriere e usa la CTA https", async () => {
    const email = await renderShippingEmail(base);
    expect(email.html).toContain("Corriere &lt;Sud&gt;");
    expect(email.html).not.toContain("<Sud>");
    expect(email.html).toContain(`href="${url}"`);
    expect(email.text).toContain(`Email.shipping.cta: ${url}`);
  });
});
