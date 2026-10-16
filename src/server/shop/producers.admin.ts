"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminFormAction, AdminFormState } from "@/lib/admin-form";
import type { ProducerFormValues } from "@/lib/shop/form-values";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { producers } from "@/server/db/schema";
import { dbErrorCode, emptyToNull } from "./action-utils";
import { formFlag, formOptionalText, formText } from "./form";

// Marchi e produttori di origine (solo admin). Pubblicare = is_public e is_active: solo allora la
// pagina /produttori/<slug> esce nel sito. Email, partita IVA e indirizzo non escono mai dalle
// letture pubbliche: il modulo admin li legge con dbAdmin.

const PRODUCERS_PATH = "/[locale]/admin/produttori";

const producerInput = z.object({
  id: z.uuid().nullable(),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1).max(200),
  email: z.email().max(200).nullable(),
  vatNumber: z.string().max(32).nullable(),
  address: z.string().max(300).nullable(),
  storyIt: z.string().max(4000).nullable(),
  storyEn: z.string().max(4000).nullable(),
  areaId: z.uuid().nullable(),
  placeId: z.uuid().nullable(),
  isPublic: z.boolean(),
  isActive: z.boolean(),
});

const idOrNull = (value: string): string | null => (value === "" ? null : value);

export const saveProducer: AdminFormAction = async (_prev, formData): Promise<AdminFormState> => {
  const parsed = producerInput.safeParse({
    id: idOrNull(formText(formData, "id")),
    slug: formText(formData, "slug"),
    name: formText(formData, "name"),
    email: emptyToNull(formOptionalText(formData, "email")),
    vatNumber: emptyToNull(formOptionalText(formData, "vatNumber")),
    address: emptyToNull(formOptionalText(formData, "address")),
    storyIt: emptyToNull(formOptionalText(formData, "storyIt")),
    storyEn: emptyToNull(formOptionalText(formData, "storyEn")),
    areaId: idOrNull(formText(formData, "areaId")),
    placeId: idOrNull(formText(formData, "placeId")),
    isPublic: formFlag(formData, "isPublic"),
    isActive: formFlag(formData, "isActive"),
  });
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();

  const value = parsed.data;
  const values = {
    slug: value.slug,
    name: value.name,
    email: value.email,
    vatNumber: value.vatNumber,
    address: value.address,
    storyIt: value.storyIt,
    storyEn: value.storyEn,
    areaId: value.areaId,
    placeId: value.placeId,
    isPublic: value.isPublic,
    isActive: value.isActive,
  };

  try {
    const rows = value.id
      ? await dbAdmin.update(producers).set(values).where(eq(producers.id, value.id)).returning({ id: producers.id })
      : await dbAdmin.insert(producers).values(values).returning({ id: producers.id });
    if (rows.length === 0) return { status: "error", code: "invalid" };
    revalidatePath(PRODUCERS_PATH);
    return { status: "saved" };
  } catch (error) {
    const { sqlstate } = dbErrorCode(error);
    console.error("saveProducer", sqlstate);
    if (sqlstate === "23505") return { status: "error", code: "slug_taken" };
    if (sqlstate === "23514" || sqlstate === "23503") return { status: "error", code: "invalid" };
    return { status: "error", code: "failed" };
  }
};

export async function listProducersAdmin(): Promise<ProducerFormValues[]> {
  await requireAdmin();
  const rows = await dbAdmin.select().from(producers).orderBy(asc(producers.name));
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    email: row.email,
    vatNumber: row.vatNumber,
    address: row.address,
    storyIt: row.storyIt,
    storyEn: row.storyEn,
    areaId: row.areaId,
    placeId: row.placeId,
    isPublic: row.isPublic,
    isActive: row.isActive,
  }));
}
