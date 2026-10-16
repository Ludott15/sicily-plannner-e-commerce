import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { badges, userBadges } from "@/server/db/schema";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";
import type { NextBadge } from "./types";

// Badge dell'utente (passo 5.2): quelli ottenuti e il progresso verso quelli non ancora ottenuti.
// Tutto passa da dbAsUser (RLS): user_badges legge solo le proprie righe, my_badge_progress()
// usa auth.uid(). Il nome segue la lingua della pagina.

export type EarnedBadge = {
  key: string;
  name: string;
  awardedAt: string;
};

export type MyBadges = {
  earned: EarnedBadge[];
  next: NextBadge[];
};

type NextBadgeRow = {
  key: string;
  nameIt: string;
  nameEn: string;
  current: number;
  target: number;
};

function nameFor(locale: string, row: { nameIt: string; nameEn: string }): string {
  return locale === "en" ? row.nameEn : row.nameIt;
}

// Progresso sui badge non ancora ottenuti (my_badge_progress), con nome nella lingua richiesta.
// Va chiamata dentro una transazione dbAsUser.
export async function selectNextBadges(tx: UserTx, locale: string): Promise<NextBadge[]> {
  const rows = await tx.execute<NextBadgeRow>(sql`
    select
      b.key,
      b.name_it as "nameIt",
      b.name_en as "nameEn",
      p.current_value as current,
      p.target_value as target
    from public.my_badge_progress() p
    join public.badges b on b.key = p.badge_key
    order by b.key`);
  return rows.map((r) => ({
    key: r.key,
    name: nameFor(locale, r),
    current: Number(r.current),
    target: Number(r.target),
  }));
}

export async function getMyBadges(user: DbUser, locale: string = "it"): Promise<MyBadges> {
  return dbAsUser(user, async (tx) => {
    const earnedRows = await tx
      .select({
        key: badges.key,
        nameIt: badges.nameIt,
        nameEn: badges.nameEn,
        awardedAt: userBadges.awardedAt,
      })
      .from(userBadges)
      .innerJoin(badges, eq(badges.key, userBadges.badgeKey))
      .orderBy(desc(userBadges.awardedAt), badges.key);
    const next = await selectNextBadges(tx, locale);
    return {
      earned: earnedRows.map((r) => ({
        key: r.key,
        name: nameFor(locale, r),
        awardedAt: new Date(r.awardedAt).toISOString(),
      })),
      next,
    };
  });
}
