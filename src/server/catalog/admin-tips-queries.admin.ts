import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { activities, localTipAuthors, localTips, places } from "@/server/db/schema";

// Letture dell'admin dei consigli locali: tutti i consigli, anche scaduti o spenti.

// Scadenza: 12 mesi dopo la verifica; in coda "Da riverificare" 30 giorni prima.
const expiresOn = sql<string>`(${localTips.verifiedAt} + interval '12 months')::date::text`;
const target = sql<string>`coalesce(${activities.title}, ${places.name})`;

export async function adminListTips() {
  await requireAdmin();
  return dbAdmin
    .select({
      id: localTips.id,
      body: localTips.body,
      verifiedAt: localTips.verifiedAt,
      expiresOn,
      isActive: localTips.isActive,
      target,
      author: localTipAuthors.displayName,
      due: sql<boolean>`${localTips.verifiedAt} + interval '12 months' <= current_date + interval '30 days'`,
      expired: sql<boolean>`${localTips.verifiedAt} + interval '12 months' <= current_date`,
    })
    .from(localTips)
    .innerJoin(localTipAuthors, eq(localTipAuthors.id, localTips.authorId))
    .leftJoin(activities, eq(activities.id, localTips.activityId))
    .leftJoin(places, eq(places.id, localTips.placeId))
    .orderBy(asc(localTips.verifiedAt));
}

export async function adminGetTip(id: string) {
  await requireAdmin();
  const [tip] = await dbAdmin.select().from(localTips).where(eq(localTips.id, id));
  return tip ?? null;
}

export async function adminListAuthors() {
  await requireAdmin();
  return dbAdmin.select().from(localTipAuthors).orderBy(desc(localTipAuthors.isActive), asc(localTipAuthors.displayName));
}

export async function adminListActivityOptions() {
  await requireAdmin();
  return dbAdmin.select({ id: activities.id, title: activities.title }).from(activities).orderBy(asc(activities.title));
}
