import { describe, expect, it, vi } from "vitest";
import { formatSupplierAddress, renderSupplierOrderEmail } from "./supplier-order";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => {
    const t = (key: string, values?: Record<string, string>) =>
      `${namespace}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`;
    return t;
  },
}));

const base = {
  supplierName: "Fornitore <Demo>",
  orderNumber: "ISU-2026-000042",
  leadTimeDays: 3,
  address: {
    name: "Maria Rossi",
    line1: "Via Roma 1",
    line2: "Scala B",
    postalCode: "90100",
    city: "Palermo",
    province: "PA",
    country: "IT",
  },
  phone: "+39 333 0000000",
  lines: [
    { title: "Crema di pistacchio", quantity: 2, sku: "SKU-1" },
    { title: "Olio extravergine", quantity: 1, sku: null },
  ],
};

describe("renderSupplierOrderEmail", () => {
  it("oggetto con numero d'ordine, righe con codice del fornitore quando c'è", async () => {
    const email = await renderSupplierOrderEmail(base);
    expect(email.subject).toContain("Email.supplierOrder.subject");
    expect(email.subject).toContain("ISU-2026-000042");
    expect(email.text).toContain("Email.supplierOrder.lineSku");
    expect(email.text).toContain("Email.supplierOrder.line");
  });

  it("indirizzo e telefono del cliente nel testo", async () => {
    const email = await renderSupplierOrderEmail(base);
    expect(email.text).toContain("Email.supplierOrder.address");
    expect(email.text).toContain("Via Roma 1");
    expect(email.text).toContain("Email.supplierOrder.phone");
  });

  it("nessun prezzo di vendita nel contenuto", async () => {
    const email = await renderSupplierOrderEmail(base);
    // Sul testo semplice: nell'HTML il CSS ha numeri come line-height 1.25, che non sono prezzi.
    expect(email.text).not.toMatch(/€|EUR|\d+[,.]\d{2}\b/);
  });

  it("senza indirizzo né telefono: solo le righe", async () => {
    const email = await renderSupplierOrderEmail({ ...base, address: null, phone: null });
    expect(email.text).not.toContain("Email.supplierOrder.address");
    expect(email.text).not.toContain("Email.supplierOrder.phone");
  });

  it("il nome del fornitore è escapato nell'HTML", async () => {
    const email = await renderSupplierOrderEmail(base);
    expect(email.html).toContain("Fornitore &lt;Demo&gt;");
  });
});

describe("formatSupplierAddress", () => {
  it("una riga: nome, indirizzo, CAP e città, provincia, paese", () => {
    expect(formatSupplierAddress(base.address)).toBe(
      "Maria Rossi, Via Roma 1, Scala B, 90100 Palermo (PA), IT",
    );
  });

  it("senza nome né provincia né seconda riga", () => {
    expect(
      formatSupplierAddress({ name: null, line1: "Via Roma 1", line2: null, postalCode: "90100", city: "Palermo", province: null, country: "IT" }),
    ).toBe("Via Roma 1, 90100 Palermo, IT");
  });
});
