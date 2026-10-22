import "server-only";
import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/brand";
import { renderEmailLayout, subjectLine, type RenderedEmail } from "../layout";

// Ordine inoltrato al fornitore (passo 7.3): il fornitore spedisce direttamente al cliente. L'email contiene
// il numero d'ordine, le righe con il codice del fornitore, l'indirizzo e il telefono del destinatario e il
// tempo di evasione. Nessun prezzo di vendita e nessun dato di pagamento. Non ha un link all'admin: il
// fornitore non ha accesso all'area admin; il codice di tracciamento torna per email.

export type SupplierOrderLine = {
  title: string;
  quantity: number;
  sku: string | null;
};

export type SupplierOrderAddress = {
  name: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  country: string;
};

export type SupplierOrderEmailInput = {
  supplierName: string;
  orderNumber: string;
  leadTimeDays: number;
  address: SupplierOrderAddress | null;
  phone: string | null;
  lines: readonly SupplierOrderLine[];
};

// Indirizzo su una riga, per il testo semplice e per l'HTML.
export function formatSupplierAddress(address: SupplierOrderAddress): string {
  const city = [address.postalCode, address.city].filter((part) => part.trim() !== "").join(" ");
  const province = address.province ? `(${address.province})` : null;
  return [address.name, address.line1, address.line2, [city, province].filter(Boolean).join(" "), address.country]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(", ");
}

export async function renderSupplierOrderEmail(input: SupplierOrderEmailInput): Promise<RenderedEmail> {
  // I fornitori ricevono l'email in italiano, indipendentemente dalla lingua del cliente.
  const t = await getTranslations({ locale: "it", namespace: "Email.supplierOrder" });
  const values = { orderNumber: input.orderNumber, leadTimeDays: String(input.leadTimeDays), brand: BRAND_NAME };

  const paragraphs = [
    t("greeting", { supplierName: input.supplierName }),
    t("body", values),
    ...input.lines.map((line) =>
      line.sku
        ? t("lineSku", { title: line.title, quantity: String(line.quantity), sku: line.sku })
        : t("line", { title: line.title, quantity: String(line.quantity) }),
    ),
  ];
  if (input.address) paragraphs.push(t("address", { address: formatSupplierAddress(input.address) }));
  if (input.phone?.trim()) paragraphs.push(t("phone", { phone: input.phone.trim() }));

  const body = await renderEmailLayout({
    locale: "it",
    preheader: t("preheader", values),
    heading: t("heading"),
    paragraphs,
    footerNote: t("footer", values),
  });

  return { subject: subjectLine(t("subject", values)), html: body.html, text: body.text };
}
