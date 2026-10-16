"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { databaseErrorCode, type EditorialResult } from "@/lib/editorial-result";
import { routing } from "@/lib/i18n/routing";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { areas } from "@/server/db/schema";

// Descrizione di un'area (pagina /sicilia/<slug>): scritta dall'admin, lingua per lingua. Un testo
// vuoto torna null e la sezione non compare. Nessun testo di default.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

const areaSchema = z.object({
  areaId: z.uuid(),
  descriptionIt: optionalText(1200),
  descriptionEn: optionalText(1200),
});

// Campi del form: areaId, descriptionIt, descriptionEn.
export async function saveAreaDescription(formData: FormData): Promise<EditorialResult> {
  const parsed = areaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();
  try {
    const [row] = await dbAdmin
      .update(areas)
      .set({ descriptionIt: parsed.data.descriptionIt, descriptionEn: parsed.data.descriptionEn })
      .where(eq(areas.id, parsed.data.areaId))
      .returning({ id: areas.id, slug: areas.slug });
    if (!row) return { status: "error", code: "invalid" };
    for (const locale of routing.locales) revalidatePath(`/${locale}/sicilia/${row.slug}`);
    return { status: "ok", id: row.id };
  } catch (error) {
    return { status: "error", code: databaseErrorCode(error) };
  }
}
