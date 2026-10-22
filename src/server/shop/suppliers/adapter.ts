import "server-only";
import { sendEmail } from "@/server/email/send";
import {
  renderSupplierOrderEmail,
  type SupplierOrderAddress,
  type SupplierOrderLine,
} from "@/server/email/templates/supplier-order";

// Inoltro dell'ordine al fornitore (passo 7.3). Un'interfaccia con due tipi di fornitore:
// - manual: l'ordine va per email al fornitore (template supplier-order). Sempre disponibile, se c'è
//   il servizio di posta (Resend). Senza posta l'esito è "unavailable" e l'ordine resta in attesa.
// - api: dietro la stessa interfaccia, ma inattivo: nessuna integrazione reale finché non si sceglie
//   il fornitore (docs/LANCIO.md). Senza un adattatore registrato, l'esito è "unavailable".
// Il chiamante è il flusso post-commit degli ordini (order-effects.admin.ts): l'adattatore non legge né
// scrive il database. Il contenuto dell'email non si registra nei log.

export type SupplierForwardInput = {
  orderNumber: string;
  leadTimeDays: number;
  address: SupplierOrderAddress | null;
  phone: string | null;
  lines: readonly SupplierOrderLine[];
};

export type SupplierForwardResult = { status: "forwarded" } | { status: "unavailable" } | { status: "failed" };

export type SupplierAdapterSupplier = {
  name: string;
  kind: string;
  contactEmail: string;
  adapterKey: string | null;
  isActive: boolean;
};

export interface SupplierAdapter {
  readonly key: string;
  forward(input: SupplierForwardInput): Promise<SupplierForwardResult>;
}

export function manualSupplierAdapter(supplier: Pick<SupplierAdapterSupplier, "name" | "contactEmail">): SupplierAdapter {
  return {
    key: "manual",
    async forward(input) {
      const email = await renderSupplierOrderEmail({
        supplierName: supplier.name,
        orderNumber: input.orderNumber,
        leadTimeDays: input.leadTimeDays,
        address: input.address,
        phone: input.phone,
        lines: input.lines,
      });
      const result = await sendEmail({
        to: supplier.contactEmail,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (result.status === "sent") return { status: "forwarded" };
      return result.status === "unavailable" ? { status: "unavailable" } : { status: "failed" };
    },
  };
}

// Adattatori con integrazione attiva. Vuoto finché non si sceglie un fornitore con API.
const API_ADAPTERS: Readonly<Record<string, SupplierAdapter>> = {};

// L'adattatore del fornitore, o null se il fornitore è inattivo o non ha un adattatore disponibile.
export function adapterFor(supplier: SupplierAdapterSupplier): SupplierAdapter | null {
  if (!supplier.isActive) return null;
  if (supplier.kind === "manual") return manualSupplierAdapter(supplier);
  if (supplier.kind === "api" && supplier.adapterKey) {
    return Object.hasOwn(API_ADAPTERS, supplier.adapterKey) ? (API_ADAPTERS[supplier.adapterKey] ?? null) : null;
  }
  return null;
}
