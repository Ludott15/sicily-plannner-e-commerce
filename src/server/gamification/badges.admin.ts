"use server";

import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminFormState } from "@/lib/admin-form";
import { badgeCriteriaSchema, badgeKeySchema, type BadgeCriteria } from "@/lib/badges";
import { routing } from "@/lib/i18n/routing";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { adminAuditLog, badges, userBadges } from "@/server/db/schema";

// Badge (passo 5.2): elenco e modifica da /admin/badge. Zod → requireAdmin → dbAdmin in
// transazione, con una riga di admin_audit_log ("badge.save") a ogni salvataggio.
// Nessuna cancellazione: user_badges ha una foreign key restrict sul badge.

export type AdminBadgeRow = {
  key: string;
  nameIt: string;
  nameEn: string;
  description: string | null;
  criteria: BadgeCriteria;
  holders: number;
};

export async function listBadgesAdmin(): Promise<AdminBadgeRow[]> {
  await requireAdmin();
  const rows = await dbAdmin
    .select({
      key: badges.key,
      nameIt: badges.nameIt,
      nameEn: badges.nameEn,
      description: badges.description,
      criteria: badges.criteria,
      holders: sql<number>`(select count(*)::int from ${userBadges} ub where ub.badge_key = ${badges.key})`,
    })
    .from(badges)
    .orderBy(asc(badges.key));
  return rows.map((row) => ({
    key: row.key,
    nameIt: row.nameIt,
    nameEn: row.nameEn,
    description: row.description,
    criteria: badgeCriteriaSchema.parse(row.criteria),
    holders: Number(row.holders),
  }));
}

// Campi del form. I criteri arrivano come campi piatti (tipo, soglia, provincia, interesse) e
// si compongono sul server; la forma finale la verifica badgeCriteriaSchema.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

const formSchema = z.object({
  locale: z.enum(routing.locales).catch(routing.defaultLocale),
  mode: z.enum(["create", "update"]),
  key: z.string().trim(),
  nameIt: z.string().trim().min(2).max(40),
  nameEn: z.string().trim().min(2).max(40),
  description: optionalText(300),
  criteriaType: z.string().trim(),
  min: z.string().trim(),
  province: z.string().trim(),
  interest: z.string().trim(),
});

type CriteriaFields = Pick<z.infer<typeof formSchema>, "criteriaType" | "min" | "province" | "interest">;

// Compone l'oggetto dei criteri dai campi del form. Campi non pertinenti al tipo sono esclusi,
// così la validazione li rifiuta se arrivano pieni.
function buildCriteria(fields: CriteriaFields): unknown {
  const type = fields.criteriaType;
  const min = Number(fields.min);
  if (type === "check_ins_in_province") return { type, province: fields.province, min };
  if (type === "interest_activities_completed") return { type, interest: fields.interest, min };
  return { type, min };
}

class BadgeSaveError extends Error {
  constructor(readonly code: "slug_taken" | "invalid") {
    super(code);
  }
}

export async function saveBadge(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = formSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  const input = parsed.data;

  const criteria = badgeCriteriaSchema.safeParse(buildCriteria(input));
  if (!criteria.success) return { status: "error", code: "invalid" };

  // La chiave si sceglie alla creazione e non cambia più; in modifica arriva dal form (campo nascosto).
  const keyCheck = badgeKeySchema.safeParse(input.key);
  if (!keyCheck.success) return { status: "error", code: "invalid" };
  const key = keyCheck.data;

  const { user } = await requireAdmin();
  const values = {
    nameIt: input.nameIt,
    nameEn: input.nameEn,
    description: input.description,
    criteria: criteria.data,
  };

  try {
    await dbAdmin.transaction(async (tx) => {
      const [previous] = await tx
        .select({ key: badges.key })
        .from(badges)
        .where(eq(badges.key, key));

      if (input.mode === "create") {
        if (previous) throw new BadgeSaveError("slug_taken");
        await tx.insert(badges).values({ key, ...values });
      } else {
        if (!previous) throw new BadgeSaveError("invalid");
        await tx.update(badges).set(values).where(eq(badges.key, key));
      }

      await tx.insert(adminAuditLog).values({
        actorId: user.id,
        action: "badge.save",
        entity: "badges",
        entityId: null,
        diff: { key, mode: input.mode, criteria: criteria.data, nameIt: input.nameIt, nameEn: input.nameEn },
      });
    });
  } catch (error) {
    if (error instanceof BadgeSaveError) return { status: "error", code: error.code };
    return { status: "error", code: "failed" };
  }

  revalidatePath(`/${input.locale}/admin/badge`);
  revalidatePath(`/${input.locale}/punti`);
  return { status: "saved" };
}
