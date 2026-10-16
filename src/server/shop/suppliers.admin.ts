"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminFormAction, AdminFormState } from "@/lib/admin-form";
import type { SupplierFormValues } from "@/lib/shop/form-values";
import { SUPPLIER_KINDS } from "@/lib/shop/config";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { suppliers } from "@/server/db/schema";
import { dbErrorCode, emptyToNull } from "./action-utils";
import { formFlag, formOptionalText, formText } from "./form";

// Fornitori logistici (solo admin). Il fornitore non è mai pubblico: nessun grant ai client.
// Ordine: lettura dei campi → Zod → requireAdmin → scrittura con dbAdmin.

const SUPPLIERS_PATH = "/[locale]/admin/fornitori";

const supplierInput = z
  .object({
    id: z.uuid().nullable(),
    name: z.string().min(1).max(200),
    kind: z.enum(SUPPLIER_KINDS),
    contactEmail: z.email().max(200),
    portalUrl: z.string().max(500).nullable(),
    adapterKey: z.string().max(60).nullable(),
    notes: z.string().max(2000).nullable(),
    isActive: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.portalUrl !== null && !value.portalUrl.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["portalUrl"], message: "portal_url_https" });
    }
    if (value.kind === "api" && value.adapterKey === null) {
      ctx.addIssue({ code: "custom", path: ["adapterKey"], message: "adapter_key_required" });
    }
  });

export const saveSupplier: AdminFormAction = async (_prev, formData): Promise<AdminFormState> => {
  const idText = formText(formData, "id");
  const parsed = supplierInput.safeParse({
    id: idText === "" ? null : idText,
    name: formText(formData, "name"),
    kind: formText(formData, "kind"),
    contactEmail: formText(formData, "contactEmail"),
    portalUrl: emptyToNull(formOptionalText(formData, "portalUrl")),
    adapterKey: emptyToNull(formOptionalText(formData, "adapterKey")),
    notes: emptyToNull(formOptionalText(formData, "notes")),
    isActive: formFlag(formData, "isActive"),
  });
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();

  const value = parsed.data;
  const values = {
    name: value.name,
    kind: value.kind,
    contactEmail: value.contactEmail,
    portalUrl: value.portalUrl,
    adapterKey: value.kind === "api" ? value.adapterKey : null,
    notes: value.notes,
    isActive: value.isActive,
  };

  try {
    const rows = value.id
      ? await dbAdmin.update(suppliers).set(values).where(eq(suppliers.id, value.id)).returning({ id: suppliers.id })
      : await dbAdmin.insert(suppliers).values(values).returning({ id: suppliers.id });
    if (rows.length === 0) return { status: "error", code: "invalid" };
    revalidatePath(SUPPLIERS_PATH);
    return { status: "saved" };
  } catch (error) {
    console.error("saveSupplier", dbErrorCode(error).sqlstate);
    return { status: "error", code: "failed" };
  }
};

export async function listSuppliersAdmin(): Promise<SupplierFormValues[]> {
  await requireAdmin();
  const rows = await dbAdmin.select().from(suppliers).orderBy(asc(suppliers.name));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind as SupplierFormValues["kind"],
    contactEmail: row.contactEmail,
    portalUrl: row.portalUrl,
    adapterKey: row.adapterKey,
    notes: row.notes,
    isActive: row.isActive,
  }));
}
