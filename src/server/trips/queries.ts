import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { activities, activityOffers, areas, itineraries, itineraryBookings, itineraryItems, places } from "@/server/db/schema";
import { dbAsUser, type DbUser } from "@/server/db/user";

// Letture dei viaggi dell'utente (M5). Sempre con dbAsUser: la RLS mostra solo i propri
// itinerari e quelli dei gruppi di cui si è membri (can_access_itinerary).

export async function listMyTrips(user: DbUser) {
  return dbAsUser(user, (tx) =>
    tx
      .select({
        id: itineraries.id,
        title: itineraries.title,
        days: itineraries.days,
        startDate: itineraries.startDate,
        travelers: itineraries.travelers,
        stops: sql<number>`(select count(*)::int from ${itineraryItems} ii where ii.itinerary_id = ${itineraries.id})`,
      })
      .from(itineraries)
      .where(and(eq(itineraries.ownerId, user.id), eq(itineraries.isTemplate, false)))
      .orderBy(desc(itineraries.createdAt)),
  );
}

export type TripStop = {
  id: string;
  dayIndex: number;
  position: number;
  title: string;
  activityId: string | null;
  activitySlug: string | null;
  placeName: string | null;
  areaSlug: string | null;
  durationMin: number | null;
  requiresCar: boolean;
  startTime: string | null;
};

export async function getTrip(user: DbUser, id: string) {
  return dbAsUser(user, async (tx) => {
    const [trip] = await tx
      .select({
        id: itineraries.id,
        ownerId: itineraries.ownerId,
        title: itineraries.title,
        days: itineraries.days,
        dayTitles: itineraries.dayTitles,
        startDate: itineraries.startDate,
        travelers: itineraries.travelers,
        isTemplate: itineraries.isTemplate,
      })
      .from(itineraries)
      .where(eq(itineraries.id, id));
    if (!trip || trip.isTemplate) return null;

    const stops: TripStop[] = await tx
      .select({
        id: itineraryItems.id,
        dayIndex: itineraryItems.dayIndex,
        position: itineraryItems.position,
        title: sql<string>`coalesce(${activities.title}, ${itineraryItems.customTitle}, ${places.name}, '')`,
        activityId: itineraryItems.activityId,
        activitySlug: activities.slug,
        placeName: places.name,
        areaSlug: areas.slug,
        durationMin: activities.durationMin,
        requiresCar: sql<boolean>`coalesce(${activities.requiresCar}, false)`,
        startTime: itineraryItems.startTime,
      })
      .from(itineraryItems)
      .leftJoin(activities, eq(activities.id, itineraryItems.activityId))
      .leftJoin(places, eq(places.id, sql`coalesce(${itineraryItems.placeId}, ${activities.placeId})`))
      .leftJoin(areas, eq(areas.id, places.areaId))
      .where(eq(itineraryItems.itineraryId, id))
      .orderBy(asc(itineraryItems.dayIndex), asc(itineraryItems.position));

    // Attività con almeno un'offerta attiva: entrano nella checklist "Da prenotare", con il
    // partner dell'offerta più economica (il link arriva con la M6).
    const activityIds = [...new Set(stops.flatMap((s) => (s.activityId ? [s.activityId] : [])))];
    const offers = activityIds.length
      ? await tx
          .select({ activityId: activityOffers.activityId, partner: activityOffers.partner, price: activityOffers.priceFromEur })
          .from(activityOffers)
          .where(and(inArray(activityOffers.activityId, activityIds), eq(activityOffers.isActive, true)))
          .orderBy(asc(activityOffers.priceFromEur), asc(activityOffers.id))
      : [];
    const bookings = await tx
      .select({ kind: itineraryBookings.kind, activityId: itineraryBookings.activityId, status: itineraryBookings.status })
      .from(itineraryBookings)
      .where(eq(itineraryBookings.itineraryId, id));

    return { ...trip, stops, offers, bookings };
  });
}

// Per "Aggiungi al viaggio": i viaggi dell'utente con le aree di ogni giorno e quante tappe ha.
export async function tripsForPicker(user: DbUser) {
  return dbAsUser(user, async (tx) => {
    const trips = await tx
      .select({ id: itineraries.id, title: itineraries.title, days: itineraries.days })
      .from(itineraries)
      .where(and(eq(itineraries.ownerId, user.id), eq(itineraries.isTemplate, false)))
      .orderBy(desc(itineraries.createdAt));
    if (trips.length === 0) return [];
    const rows = await tx
      .select({ itineraryId: itineraryItems.itineraryId, dayIndex: itineraryItems.dayIndex, area: areas.slug })
      .from(itineraryItems)
      .leftJoin(activities, eq(activities.id, itineraryItems.activityId))
      .leftJoin(places, eq(places.id, sql`coalesce(${itineraryItems.placeId}, ${activities.placeId})`))
      .leftJoin(areas, eq(areas.id, places.areaId))
      .where(inArray(itineraryItems.itineraryId, trips.map((t) => t.id)));
    return trips.map((t) => ({
      ...t,
      dayAreas: Array.from({ length: t.days }, (_, d) => [
        ...new Set(rows.filter((r) => r.itineraryId === t.id && r.dayIndex === d && r.area).map((r) => r.area!)),
      ]),
      dayStops: Array.from({ length: t.days }, (_, d) => rows.filter((r) => r.itineraryId === t.id && r.dayIndex === d).length),
    }));
  });
}

// Area di viaggio di un luogo (per proporre il giorno compatibile); null se non assegnata.
export async function placeArea(user: DbUser, placeId: string): Promise<string | null> {
  const [row] = await dbAsUser(user, (tx) =>
    tx.select({ slug: areas.slug }).from(places).innerJoin(areas, eq(areas.id, places.areaId)).where(eq(places.id, placeId)),
  );
  return row?.slug ?? null;
}
