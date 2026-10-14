"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminFormState } from "@/lib/admin-form";
import { routing } from "@/lib/i18n/routing";
import { PARTNER_ID_ENV_NAMES } from "@/lib/partner-env-names";
import { partnerIdFromEnv } from "@/server/affiliates/partners";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { adminAuditLog, affiliatePartners } from "@/server/db/schema";

// Partner affiliati (passo 3.1): elenco e modifica di affiliate_partners da /admin/partner.
// Zod → requireAdmin → dbAdmin in transazione, con una riga di admin_audit_log ("partner.update")
// a ogni modifica. L'ID del partner sta nell'ambiente: qui si mostra solo se è impostato, mai il valore.

const PARTNER_CHOICES = [
  "booking",
  "discovercars",
  "getyourguide",
  "viator",
  "civitatis",
  "travelpayouts",
  "car_rental",
] as const;
const VERTICAL_CHOICES = ["lodging", "car", "activity", "flight"] as const;

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

const checkbox = z
  .string()
  .optional()
  .transform((value) => value === "on");

const partnerSchema = z
  .object({
    partner: z.enum(PARTNER_CHOICES),
    locale: z.enum(routing.locales).catch(routing.defaultLocale),
    name: z.string().trim().min(2).max(60),
    verticals: z.array(z.enum(VERTICAL_CHOICES)).min(1),
    // Solo https; vuoto = il partner non ha una ricerca (offerte manuali).
    searchUrlTemplate: optionalText(1000).refine(
      (value) => value === null || value.startsWith("https://"),
    ),
    // Host esatti, uno per riga o separati da virgola. Minuscolo, senza porta né percorso.
    allowedHosts: z
      .string()
      .transform((value) =>
        value
          .split(/[\s,]+/)
          .map((host) => host.trim().toLowerCase())
          .filter((host) => host !== ""),
      )
      .pipe(z.array(z.string().regex(HOST)).max(20)),
    subidParam: optionalText(20).refine((value) => value === null || /^[a-z][a-z0-9_]{0,19}$/.test(value)),
    // Solo un nome di PARTNER_ID_ENV_NAMES, oppure vuoto (nessuna variabile): mai un'altra variabile d'ambiente.
    partnerIdEnv: z
      .union([z.literal(""), z.enum(PARTNER_ID_ENV_NAMES)])
      .transform((value) => (value === "" ? null : value)),
    isActive: checkbox,
  })
  .refine((value) => !value.isActive || value.allowedHosts.length > 0, {
    path: ["allowedHosts"],
  });

export type AffiliatePartnerFields = {
  name: string;
  verticals: string[];
  searchUrlTemplate: string | null;
  allowedHosts: string[];
  subidParam: string | null;
  partnerIdEnv: string | null;
  isActive: boolean;
};

export type AffiliatePartnerRow = AffiliatePartnerFields & {
  partner: string;
  updatedAt: Date;
  // Solo se l'ID è impostato nell'ambiente: il valore non esce mai.
  envConfigured: boolean;
};

function pickFields(row: AffiliatePartnerFields): AffiliatePartnerFields {
  return {
    name: row.name,
    verticals: row.verticals,
    searchUrlTemplate: row.searchUrlTemplate,
    allowedHosts: row.allowedHosts,
    subidParam: row.subidParam,
    partnerIdEnv: row.partnerIdEnv,
    isActive: row.isActive,
  };
}

export async function listAffiliatePartners(): Promise<AffiliatePartnerRow[]> {
  await requireAdmin();
  const rows = await dbAdmin.select().from(affiliatePartners).orderBy(asc(affiliatePartners.name));
  return rows.map((row) => ({
    ...pickFields(row),
    partner: row.partner,
    updatedAt: row.updatedAt,
    envConfigured: partnerIdFromEnv(row.partnerIdEnv) !== null,
  }));
}

export async function savePartner(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = partnerSchema.safeParse({
    ...Object.fromEntries(formData),
    verticals: formData.getAll("verticals").map(String),
  });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { user } = await requireAdmin();
  const { partner, locale, ...fields } = parsed.data;
  const next: AffiliatePartnerFields = pickFields(fields);

  try {
    await dbAdmin.transaction(async (tx) => {
      const [previous] = await tx.select().from(affiliatePartners).where(eq(affiliatePartners.partner, partner));
      if (!previous) throw new Error("not_found");
      await tx
        .update(affiliatePartners)
        .set({ ...next, updatedAt: sql`now()` })
        .where(eq(affiliatePartners.partner, partner));
      await tx.insert(adminAuditLog).values({
        actorId: user.id,
        action: "partner.update",
        entity: "affiliate_partners",
        entityId: null,
        diff: { partner, before: pickFields(previous), after: next },
      });
    });
  } catch {
    return { status: "error", code: "failed" };
  }

  revalidatePath(`/${locale}/admin/partner`);
  revalidatePath(`/${locale}/affiliazioni`);
  revalidatePath(`/${locale}/dove-dormire`);
  revalidatePath(`/${locale}/noleggio-auto`);
  return { status: "saved" };
}
