import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { activities, activityInterests, activityOffers, areas, interests, itineraries, itineraryItems, places } from "@/server/db/schema";

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
      offers: sql<number>`(select count(*)::int from ${activityOffers} o where o.activity_id = ${activities.id})`,
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
  return dbAdmin
    .select({ id: places.id, name: places.name, slug: places.slug, province: places.province, areaSlug: areas.slug })
    .from(places)
    .leftJoin(areas, eq(areas.id, places.areaId))
    .orderBy(asc(places.name));
}

export async function adminListAreas() {
  await requireAdmin();
  return dbAdmin.select().from(areas).orderBy(asc(areas.sort));
}

// Copertura del catalogo per area (M4 parte 3): attività attive, attività con tag (anche
// quelle in coda, inattive), attive con almeno un'offerta attiva, attive con un consiglio
// locale pubblicabile (attivo e verificato negli ultimi 12 mesi, come public_local_tips).
// area_id null = luoghi ancora senza area: le loro attività non entrano nelle proposte.
export type AreaCoverage = {
  areaId: string | null;
  slug: string | null;
  nameIt: string | null;
  nameEn: string | null;
  sort: number;
  total: number;
  active: number;
  tagged: number;
  withOffer: number;
  withTip: number;
};

export async function adminCatalogCoverage(): Promise<AreaCoverage[]> {
  await requireAdmin();
  const rows = await dbAdmin.execute<AreaCoverage>(sql`
    with per_activity as (
      select
        p.area_id,
        a.is_active,
        exists (select 1 from public.activity_interests ai where ai.activity_id = a.id) as tagged,
        exists (select 1 from public.activity_offers o where o.activity_id = a.id and o.is_active) as with_offer,
        exists (
          select 1 from public.local_tips lt
          where lt.activity_id = a.id and lt.is_active and lt.verified_at >= current_date - interval '12 months'
        ) as with_tip
      from public.activities a
      join public.places p on p.id = a.place_id
    )
    select
      ar.id as "areaId", ar.slug, ar.name_it as "nameIt", ar.name_en as "nameEn", ar.sort::int as sort,
      count(pa.*)::int as total,
      count(*) filter (where pa.is_active)::int as active,
      count(*) filter (where pa.tagged)::int as tagged,
      count(*) filter (where pa.is_active and pa.with_offer)::int as "withOffer",
      count(*) filter (where pa.is_active and pa.with_tip)::int as "withTip"
    from public.areas ar
    left join per_activity pa on pa.area_id = ar.id
    group by ar.id
    union all
    select
      null, null, null, null, 32767,
      count(*)::int,
      count(*) filter (where pa.is_active)::int,
      count(*) filter (where pa.tagged)::int,
      count(*) filter (where pa.is_active and pa.with_offer)::int,
      count(*) filter (where pa.is_active and pa.with_tip)::int
    from per_activity pa
    where pa.area_id is null
    order by sort`);
  return [...rows];
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

export async function adminListOffers(activityId: string) {
  await requireAdmin();
  return dbAdmin
    .select()
    .from(activityOffers)
    .where(eq(activityOffers.activityId, activityId))
    .orderBy(desc(activityOffers.isActive), asc(activityOffers.title));
}
