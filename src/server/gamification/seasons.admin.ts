"use server";

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminFormState } from "@/lib/admin-form";
import { routing } from "@/lib/i18n/routing";
import { isSeasonOver } from "@/lib/season-nav";
import { SEASON_PATTERN } from "@/lib/seasons";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { adminAuditLog, seasonAwards } from "@/server/db/schema";
import { matchCode, pgErrorMessage } from "./pg";

// Stagioni (passo 5.3): premi dei primi dieci da /admin/stagioni. Zod → requireAdmin → dbAdmin,
// con una riga di admin_audit_log per ogni chiusura ("season.close") e ogni cambio di premio
// ("season.prize_status"). La chiusura è una funzione SQL (close_season) che non riscrive una
// stagione già chiusa.

const PRIZE_STATUSES = ["pending", "assigned", "shipped"] as const;
export type PrizeStatus = (typeof PRIZE_STATUSES)[number];

export type SeasonAwardRow = {
  rank: number;
  publicName: string | null;
  points: number;
  prizeStatus: PrizeStatus;
};


const prizeStatusSchema = z.enum(PRIZE_STATUSES);

export async function listSeasonAwards(season: string): Promise<SeasonAwardRow[]> {
  await requireAdmin();
  if (!SEASON_PATTERN.test(season)) return [];

  const rows = await dbAdmin.execute<{
    rank: number;
    public_name: string | null;
    points: number;
    prize_status: string;
  }>(sql`
    select
      a.rank,
      case when a.user_id is null then null
        else public.public_name_for(
          p.display_name,
          coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
        )
      end as public_name,
      a.points,
      a.prize_status
    from public.season_awards a
    left join public.profiles p on p.id = a.user_id
    left join auth.users u on u.id = a.user_id
    where a.season = ${season}
    order by a.rank
  `);

  return Array.from(rows, (row) => ({
    rank: row.rank,
    publicName: row.public_name,
    points: row.points,
    prizeStatus: prizeStatusSchema.parse(row.prize_status),
  }));
}

const closeSchema = z.object({
  season: z.string().regex(SEASON_PATTERN),
  locale: z.enum(routing.locales).catch(routing.defaultLocale),
});

const prizeSchema = z.object({
  season: z.string().regex(SEASON_PATTERN),
  rank: z.coerce.number().int().min(1).max(10),
  status: prizeStatusSchema,
  locale: z.enum(routing.locales).catch(routing.defaultLocale),
});

const SEASON_CODES = ["invalid_season"] as const;

class SeasonAdminError extends Error {
  constructor(readonly code: "invalid") {
    super(code);
  }
}

// Chiude una stagione: fotografa i primi dieci non in opt-out. Se la stagione è già chiusa non
// cambia nulla e non scrive l'audit (il risultato resta "saved").
export async function closeSeason(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = closeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  const input = parsed.data;
  // Si chiude solo una stagione finita: i premi si fissano a classifica definitiva.
  if (!isSeasonOver(input.season)) return { status: "error", code: "invalid" };

  const { user } = await requireAdmin();
  try {
    await dbAdmin.transaction(async (tx) => {
      const rows = await tx.execute<{ inserted: number }>(
        sql`select public.close_season(${input.season})::int as inserted`,
      );
      const [result] = Array.from(rows);
      if (!result || result.inserted === 0) return;

      await tx.insert(adminAuditLog).values({
        actorId: user.id,
        action: "season.close",
        entity: "season_awards",
        entityId: null,
        diff: { season: input.season, awarded: result.inserted },
      });
    });
  } catch (error) {
    const code = matchCode(pgErrorMessage(error), SEASON_CODES);
    if (code === "invalid_season") return { status: "error", code: "invalid" };
    return { status: "error", code: "failed" };
  }

  revalidatePath(`/${input.locale}/admin/stagioni`);
  revalidatePath(`/${input.locale}/classifica`);
  return { status: "saved" };
}

// Cambia lo stato del premio di un posto (assegnato, spedito). Il posto deve esistere.
export async function setPrizeStatus(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = prizeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "invalid" };
  const input = parsed.data;

  const { user } = await requireAdmin();
  try {
    await dbAdmin.transaction(async (tx) => {
      const updated = await tx
        .update(seasonAwards)
        .set({ prizeStatus: input.status, updatedAt: new Date() })
        .where(and(eq(seasonAwards.season, input.season), eq(seasonAwards.rank, input.rank)))
        .returning({ rank: seasonAwards.rank });
      if (updated.length === 0) throw new SeasonAdminError("invalid");

      await tx.insert(adminAuditLog).values({
        actorId: user.id,
        action: "season.prize_status",
        entity: "season_awards",
        entityId: null,
        diff: { season: input.season, rank: input.rank, status: input.status },
      });
    });
  } catch (error) {
    if (error instanceof SeasonAdminError) return { status: "error", code: error.code };
    return { status: "error", code: "failed" };
  }

  revalidatePath(`/${input.locale}/admin/stagioni`);
  return { status: "saved" };
}
