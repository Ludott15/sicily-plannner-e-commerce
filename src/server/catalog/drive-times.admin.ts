"use server";

import { asc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminFormState } from "@/lib/admin-form";
import { orderPair } from "@/lib/drive-pairs";
import { routing } from "@/lib/i18n/routing";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { adminAuditLog, areaDriveTimes, areas } from "@/server/db/schema";

// Tempi di guida tra aree (M4 parte 4): la matrice di /admin/tempi-di-guida. Zod → requireAdmin →
// dbAdmin in una transazione, con una riga di admin_audit_log ("drive_times.update") a ogni
// salvataggio. Il form manda le coppie come JSON nel campo "pairs": [{ a, b, minutes }], minutes
// null = coppia senza tempo (la riga si cancella). La coppia viene riordinata come in tabella.

const MAX_PAIRS = 28;
const UNKNOWN_AREA = "unknown_area";

const pairSchema = z
  .object({
    a: z.uuid(),
    b: z.uuid(),
    minutes: z.number().int().min(1).max(600).nullable(),
  })
  .refine((pair) => pair.a.toLowerCase() !== pair.b.toLowerCase(), { path: ["b"] })
  .transform((pair) => {
    const [a, b] = orderPair(pair.a.toLowerCase(), pair.b.toLowerCase());
    return { a, b, minutes: pair.minutes };
  });

const payloadSchema = z.object({
  locale: z.enum(routing.locales).catch(routing.defaultLocale),
  pairs: z.array(pairSchema).max(MAX_PAIRS),
});

export type DriveTimePair = { a: string; b: string; minutes: number };
export type DriveTimeArea = { id: string; slug: string; nameIt: string; nameEn: string; sort: number };

type AdminTx = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];

function parsePairs(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

async function readPairs(tx: AdminTx): Promise<DriveTimePair[]> {
  return tx
    .select({ a: areaDriveTimes.areaAId, b: areaDriveTimes.areaBId, minutes: areaDriveTimes.minutes })
    .from(areaDriveTimes)
    .orderBy(asc(areaDriveTimes.areaAId), asc(areaDriveTimes.areaBId));
}

export async function listDriveTimes(): Promise<{ areas: DriveTimeArea[]; pairs: DriveTimePair[] }> {
  await requireAdmin();
  const [areaRows, pairRows] = await Promise.all([
    dbAdmin
      .select({ id: areas.id, slug: areas.slug, nameIt: areas.nameIt, nameEn: areas.nameEn, sort: areas.sort })
      .from(areas)
      .orderBy(asc(areas.sort), asc(areas.slug)),
    dbAdmin
      .select({ a: areaDriveTimes.areaAId, b: areaDriveTimes.areaBId, minutes: areaDriveTimes.minutes })
      .from(areaDriveTimes),
  ]);
  return { areas: areaRows, pairs: pairRows };
}

export async function saveDriveTimes(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = payloadSchema.safeParse({
    locale: formData.get("locale"),
    pairs: parsePairs(formData.get("pairs")),
  });
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { locale, pairs } = parsed.data;
  if (new Set(pairs.map((pair) => `${pair.a}+${pair.b}`)).size !== pairs.length) {
    return { status: "error", code: "invalid" };
  }
  const { user } = await requireAdmin();

  const writes = pairs.flatMap((pair) =>
    pair.minutes === null ? [] : [{ areaAId: pair.a, areaBId: pair.b, minutes: pair.minutes }],
  );
  const clears = pairs.flatMap((pair) => (pair.minutes === null ? [{ a: pair.a, b: pair.b }] : []));

  try {
    await dbAdmin.transaction(async (tx) => {
      const known = new Set((await tx.select({ id: areas.id }).from(areas)).map((row) => row.id));
      if (pairs.some((pair) => !known.has(pair.a) || !known.has(pair.b))) throw new Error(UNKNOWN_AREA);

      const before = await readPairs(tx);
      if (writes.length > 0) {
        await tx
          .insert(areaDriveTimes)
          .values(writes)
          .onConflictDoUpdate({
            target: [areaDriveTimes.areaAId, areaDriveTimes.areaBId],
            set: { minutes: sql`excluded.minutes`, updatedAt: sql`now()` },
          });
      }
      if (clears.length > 0) {
        const keys = sql.join(
          clears.map((clear) => sql`(${clear.a}::uuid, ${clear.b}::uuid)`),
          sql`, `,
        );
        await tx
          .delete(areaDriveTimes)
          .where(sql`(${areaDriveTimes.areaAId}, ${areaDriveTimes.areaBId}) in (${keys})`);
      }
      const after = await readPairs(tx);

      await tx.insert(adminAuditLog).values({
        actorId: user.id,
        action: "drive_times.update",
        entity: "area_drive_times",
        entityId: null,
        diff: { before, after },
      });
    });
  } catch (error) {
    const invalid = error instanceof Error && error.message === UNKNOWN_AREA;
    return { status: "error", code: invalid ? "invalid" : "failed" };
  }

  // La matrice tocca la pagina dell'admin, le proposte e i viaggi salvati (avvisi del giorno di trasferimento).
  revalidatePath(`/${locale}/admin/tempi-di-guida`);
  revalidatePath(`/${locale}/viaggio/proposte`);
  revalidatePath(`/${locale}/viaggi`, "layout");
  return { status: "saved" };
}
