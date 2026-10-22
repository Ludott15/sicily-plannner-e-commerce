import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailMessage, EmailSendResult } from "@/server/email/send";
import { adapterFor, manualSupplierAdapter, type SupplierForwardInput } from "./adapter";

const sendEmail = vi.fn<(message: EmailMessage) => Promise<EmailSendResult>>();

vi.mock("@/server/email/send", () => ({
  sendEmail: (message: EmailMessage) => sendEmail(message),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string) => `${namespace}.${key}`,
}));

const input: SupplierForwardInput = {
  orderNumber: "ISU-2026-000007",
  leadTimeDays: 4,
  address: { name: "Maria", line1: "Via Roma 1", line2: null, postalCode: "90100", city: "Palermo", province: "PA", country: "IT" },
  phone: "+39 333 0000000",
  lines: [{ title: "Crema", quantity: 1, sku: "SKU-9" }],
};

const supplier = { name: "Fornitore", kind: "manual", contactEmail: "ordini@fornitore.example", adapterKey: null, isActive: true };

beforeEach(() => {
  sendEmail.mockReset();
});

describe("adattatore manual", () => {
  it("manda l'email al fornitore e dice forwarded", async () => {
    sendEmail.mockResolvedValue({ status: "sent" });
    const result = await manualSupplierAdapter(supplier).forward(input);
    expect(result).toEqual({ status: "forwarded" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = sendEmail.mock.calls[0]?.[0];
    expect(message?.to).toBe("ordini@fornitore.example");
    // Il mock delle traduzioni non interpola i valori: si verifica che l'email usi il template dei fornitori.
    expect(message?.subject).toContain("Email.supplierOrder");
  });

  it("senza posta: unavailable, l'ordine resta in attesa", async () => {
    sendEmail.mockResolvedValue({ status: "unavailable" });
    expect(await manualSupplierAdapter(supplier).forward(input)).toEqual({ status: "unavailable" });
  });

  it("errore di invio: failed", async () => {
    sendEmail.mockResolvedValue({ status: "failed" });
    expect(await manualSupplierAdapter(supplier).forward(input)).toEqual({ status: "failed" });
  });
});

describe("adapterFor", () => {
  it("fornitore manuale attivo: adattatore manual", () => {
    expect(adapterFor(supplier)?.key).toBe("manual");
  });

  it("fornitore inattivo: nessun adattatore", () => {
    expect(adapterFor({ ...supplier, isActive: false })).toBeNull();
  });

  it("fornitore API senza integrazione registrata: nessun adattatore (inattivo)", () => {
    expect(adapterFor({ ...supplier, kind: "api", adapterKey: "autods" })).toBeNull();
    expect(adapterFor({ ...supplier, kind: "api", adapterKey: "toString" })).toBeNull();
  });
});
