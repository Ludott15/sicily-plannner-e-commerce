import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { activities, activityInterests, interests, itineraries, itineraryItems, places } from "@/server/db/schema";

// Letture dell'admin del catalogo: vedono anche le attività inattive e gli itinerari non
// pubblicati. Ogni funzione verifica l'admin prima di leggere.

export async function adminListActivities(filter: "tutte" | "attive" | "da-approvare") {
  await requireAdmin();
  const tagCount = sql<number>`(select count(*)::int from ${activityInterests} ai where ai.activity_id = ${activities.id})`;
  const rows = await dbAdmin
    .select({
      id: activities.id,
      slug: activities.slug,
      title: activities.title,
      isActive: activities.isActive,
      partner: activities.partner,
      placeName: places.name,
      tags: tagCount,
    })
    .from(activities)
    .innerJoin(places, eq(places.id, activities.placeId))
    .where(
      filter === "attive"
        ? eq(activities.isActive, true)
        : filter === "da-approvare"
          ? eq(activities.isActive, false)
          : undefined,
    )
    .orderBy(asc(activities.isActive), asc(activities.title));
  return rows;
}

export async function adminGetActivity(id: string) {
  await requireAdmin();
  const [activity] = await dbAdmin.select().from(activities).where(eq(activities.id, id));
  if (!activity) return null;
  const tags = await dbAdmin
    .select({ key: activityInterests.interestKey, strength: activityInterests.strength })
    .from(activityInterests)
    .where(eq(activityInterests.activityId, id))
    .orderBy(desc(activityInterests.strength));
  return { ...activity, tags };
}

export async function adminListPlaces() {
  await requireAdmin();
  return dbAdmin.select().from(places).orderBy(asc(places.name));
}

export async function adminGetPlace(id: string) {
  await requireAdmin();
  const [place] = await dbAdmin.select().from(places).where(eq(places.id, id));
  return place ?? null;
}

export async function adminListInterests() {
  await requireAdmin();
  return dbAdmin.select().from(interests).orderBy(asc(interests.sort));
}

export async function adminListTemplates() {
  await requireAdmin();
  return dbAdmin
    .select({ id: itineraries.id, title: itineraries.title, slug: itineraries.slug, days: itineraries.days })
    .from(itineraries)
    .where(eq(itineraries.isTemplate, true))
    .orderBy(asc(itineraries.title));
}

export async function adminGetTemplate(id: string) {
  await requireAdmin();
  const [template] = await dbAdmin
    .select()
    .from(itineraries)
    .where(sql`${itineraries.id} = ${id} and ${itineraries.isTemplate}`);
  if (!template) return null;
  const items = await dbAdmin
    .select({
      id: itineraryItems.id,
      dayIndex: itineraryItems.dayIndex,
      position: itineraryItems.position,
      startTime: itineraryItems.startTime,
      activityId: itineraryItems.activityId,
      placeId: itineraryItems.placeId,
      customTitle: itineraryItems.customTitle,
      activityTitle: activities.title,
      placeName: places.name,
    })
    .from(itineraryItems)
    .leftJoin(activities, eq(activities.id, itineraryItems.activityId))
    .leftJoin(places, eq(places.id, itineraryItems.placeId))
    .where(eq(itineraryItems.itineraryId, id))
    .orderBy(asc(itineraryItems.dayIndex), asc(itineraryItems.position));
  return { ...template, items };
}

// Opzioni per i selettori dei form (tutte le attività, anche inattive).
export async function adminActivityOptions() {
  await requireAdmin();
  return dbAdmin
    .select({ id: activities.id, title: activities.title, isActive: activities.isActive })
    .from(activities)
    .orderBy(asc(activities.title));
}
