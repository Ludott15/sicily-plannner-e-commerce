"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AdminErrorCode, AdminFormState } from "@/lib/admin-form";
import { routing } from "@/lib/i18n/routing";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { localTipAuthors, localTips } from "@/server/db/schema";

// Azioni dell'admin dei consigli locali: Zod → requireAdmin → scrittura con dbAdmin.
// Le regole (relazione obbligatoria per le persone, consenso, 280 caratteri, attività o
// luogo) le controlla anche il database; qui si danno messaggi chiari.

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));
const optionalUuid = z
  .string()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.uuid().nullable());
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on");

function tipErrorCode(error: unknown): AdminErrorCode {
  const cause = (error as { cause?: { message?: string; code?: string } })?.cause ?? error;
  const { message, code } = cause as { message?: string; code?: string };
  if (message === "person_tip_without_relation") return "person_tip_without_relation";
  if (code === "23514") return "invalid";
  return "failed";
}

const tipSchema = z
  .object({
    id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
    locale: localeSchema,
    authorId: z.uuid(),
    activityId: optionalUuid,
    placeId: optionalUuid,
    body: z.string().trim().min(1).max(280),
    authorRelation: optionalText,
    verifiedAt: z.iso.date(),
    isActive: checkbox,
  })
  .refine((v) => v.activityId !== null || v.placeId !== null);

export async function saveTip(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = tipSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();
  const { id, locale, ...values } = parsed.data;
  try {
    if (id) await dbAdmin.update(localTips).set(values).where(eq(localTips.id, id));
    else await dbAdmin.insert(localTips).values(values);
  } catch (error) {
    return { status: "error", code: tipErrorCode(error) };
  }
  redirect(`/${locale}/admin/consigli?salvato=1`);
}

const verifySchema = z.object({ id: z.uuid(), locale: localeSchema });

// "Riverificato oggi": l'admin ha ricontrollato il fatto; la data di verifica diventa oggi.
export async function markTipVerified(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = verifySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();
  const today = new Date().toISOString().slice(0, 10);
  await dbAdmin.update(localTips).set({ verifiedAt: today }).where(eq(localTips.id, parsed.data.id));
  redirect(`/${parsed.data.locale}/admin/consigli?riverificato=1`);
}

const authorSchema = z.object({
  id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  locale: localeSchema,
  kind: z.enum(["editorial", "person"]),
  displayName: z.string().trim().min(2).max(120),
  bio: optionalText,
  photoUrl: optionalText.pipe(z.url({ protocol: /^https$/ }).nullable()),
  consentAt: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.iso.date().nullable()),
  isActive: checkbox,
});

export async function saveAuthor(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = authorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  await requireAdmin();
  const { id, locale, consentAt, ...fields } = parsed.data;
  // Una persona firma solo con il suo consenso (data in cui l'ha dato).
  if (fields.kind === "person" && !consentAt) return { status: "error", code: "author_without_consent" };
  const values = { ...fields, consentAt: consentAt ? new Date(`${consentAt}T00:00:00Z`) : null };
  try {
    if (id) await dbAdmin.update(localTipAuthors).set(values).where(eq(localTipAuthors.id, id));
    else await dbAdmin.insert(localTipAuthors).values(values);
  } catch (error) {
    return { status: "error", code: tipErrorCode(error) };
  }
  redirect(`/${locale}/admin/consigli/autori?salvato=1`);
}
