import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { badges, pointRules, pointsLedger, reviews, userBadges } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";
import type { ActivityReviews, MyPoints, PublicReview } from "./types";

export type { PublicReview } from "./types";

// Letture dei punti, delle recensioni pubbliche e del saldo in home (passo 5.1).
// Lo storico, le regole e i badge passano da dbAsUser (RLS). Le recensioni pubbliche passano
// dalla vista public_reviews, che non espone user_id.

const MOVEMENTS_LIMIT = 50;
const PUBLIC_REVIEWS_LIMIT = 50;

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

// Saldo (somma di tutti i movimenti, anche i riscatti), ultimi movimenti, regole e badge del
// catalogo non ancora ottenuti. Il nome dei badge segue la lingua della pagina.
export async function getMyPoints(user: DbUser, locale: string = "it"): Promise<MyPoints> {
  return dbAsUser(user, async (tx) => {
    const [total] = await tx
      .select({ balance: sql<number>`coalesce(sum(${pointsLedger.delta}), 0)::int` })
      .from(pointsLedger);
    const movements = await tx
      .select({
        id: sql<string>`${pointsLedger.id}::text`,
        reason: pointsLedger.reason,
        delta: pointsLedger.delta,
        createdAt: pointsLedger.createdAt,
      })
      .from(pointsLedger)
      .orderBy(desc(pointsLedger.createdAt), desc(pointsLedger.id))
      .limit(MOVEMENTS_LIMIT);
    const rules = await tx.select({ reason: pointRules.reason, delta: pointRules.delta }).from(pointRules);
    const notEarned = await tx
      .select({ key: badges.key, nameIt: badges.nameIt, nameEn: badges.nameEn })
      .from(badges)
      .leftJoin(userBadges, and(eq(userBadges.badgeKey, badges.key), eq(userBadges.userId, user.id)))
      .where(isNull(userBadges.badgeKey))
      .orderBy(asc(badges.key));
    return {
      balance: total?.balance ?? 0,
      movements: movements.map((m) => ({
        id: m.id,
        reason: m.reason,
        delta: m.delta,
        createdAt: toIso(m.createdAt),
      })),
      rules: Object.fromEntries(rules.map((r) => [r.reason, r.delta])),
      nextBadges: notEarned.map((b) => ({
        key: b.key,
        name: locale === "en" ? b.nameEn : b.nameIt,
        progress: null,
      })),
    };
  });
}

// Saldo per la home: null per gli ospiti (non accumulano punti, la home non lo mostra).
export async function getHomePoints(user: DbUser): Promise<number | null> {
  if (user.is_anonymous) return null;
  const [row] = await dbAsUser(user, (tx) =>
    tx
      .select({ balance: sql<number>`coalesce(sum(${pointsLedger.delta}), 0)::int` })
      .from(pointsLedger),
  );
  return row?.balance ?? 0;
}

type PublicReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: Date | string;
  displayName: string | null;
  avatarUrl: string | null;
  rewarded: boolean;
};

// Recensioni pubbliche di un'attività, la propria recensione e se l'utente può recensire.
// Senza utente (o con un ospite) eligible è false: la regola sta in review_eligible.
export async function getActivityReviews(activityId: string, user: DbUser | null): Promise<ActivityReviews> {
  const run = <T>(fn: (tx: UserTx) => Promise<T>): Promise<T> => (user ? dbAsUser(user, fn) : dbPublic(fn));

  return run(async (tx) => {
    const rows = await tx.execute<PublicReviewRow>(sql`
      select
        id::text as id,
        rating,
        body,
        created_at as "createdAt",
        display_name as "displayName",
        avatar_url as "avatarUrl",
        rewarded
      from public.public_reviews
      where activity_id = ${activityId}::uuid
      order by created_at desc
      limit ${PUBLIC_REVIEWS_LIMIT}`);

    const reviewsList: PublicReview[] = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      createdAt: toIso(r.createdAt),
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      rewarded: r.rewarded,
    }));

    if (!user) return { reviews: reviewsList, mine: null, eligible: false };

    const [own] = await tx
      .select({ rating: reviews.rating, body: reviews.body })
      .from(reviews)
      .where(and(eq(reviews.activityId, activityId), eq(reviews.userId, user.id)));
    const [eligibility] = await tx.execute<{ eligible: boolean }>(
      sql`select public.review_eligible(${activityId}::uuid) as eligible`,
    );

    return {
      reviews: reviewsList,
      mine: own ? { rating: own.rating, body: own.body } : null,
      eligible: eligibility?.eligible === true,
    };
  });
}
