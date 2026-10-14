import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { isSicilyAirport } from "@/lib/flights/airports";
import { dayMinutesLimit, TIME_SLOTS, type Pace, type TimeSlot } from "@/lib/itinerary-checks";
import { partitionTrips, romeToday } from "@/lib/trip-days";
import { tripWarnings } from "@/lib/trip-warnings";
import { addDays, nearestSicilyAirport } from "@/lib/trips";
import {
  activities,
  activityOffers,
  areas,
  itineraries,
  itineraryBookings,
  itineraryItems,
  itineraryNights,
  itineraryShareLinks,
  places,
  userConstraints,
} from "@/server/db/schema";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { dbPublic } from "@/server/db/public";
import { getSavedPreferences } from "@/server/personalization/data";
import { DAILY_HOURS } from "@/server/personalization/config";
import { verticalSearchHref, type VerticalSearchInput } from "@/server/affiliates/verticals";

// Letture dei viaggi dell'utente (M5, 1.4). Sempre con dbAsUser: la RLS mostra solo i propri
// itinerari e quelli dei gruppi di cui si è membri (can_access_itinerary).
// Il link pubblico si legge solo con public.shared_itinerary (dbPublic): mai la tabella dei link.

export async function listMyTrips(user: DbUser) {
  const rows = await dbAsUser(user, (tx) =>
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
  return partitionTrips(rows, romeToday(new Date()));
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
  timeSlot: TimeSlot | null;
  notes: string | null;
};

export async function getTrip(user: DbUser, id: string) {
  const data = await dbAsUser(user, async (tx) => {
    const [trip] = await tx
      .select({
        id: itineraries.id,
        ownerId: itineraries.ownerId,
        title: itineraries.title,
        days: itineraries.days,
        dayTitles: itineraries.dayTitles,
        dayNotes: itineraries.dayNotes,
        pace: itineraries.pace,
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
        timeSlot: itineraryItems.timeSlot,
        notes: itineraryItems.notes,
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

    // Link pubblico attivo: solo la data di creazione, mai l'hash del token.
    const [link] = await tx
      .select({ createdAt: itineraryShareLinks.createdAt })
      .from(itineraryShareLinks)
      .where(and(eq(itineraryShareLinks.itineraryId, id), isNull(itineraryShareLinks.revokedAt)));

    return { trip, stops, offers, bookings, activeShareLink: link ? { createdAt: link.createdAt } : null };
  });
  if (!data) return null;

  // Ritmo effettivo: quello del viaggio, altrimenti quello del profilo, altrimenti "bilanciato".
  const pace: Pace = data.trip.pace ?? (await getSavedPreferences(user))?.pace ?? "balanced";
  const warnings = tripWarnings({
    days: data.trip.days,
    stops: data.stops.map((s) => ({ dayIndex: s.dayIndex, position: s.position, durationMin: s.durationMin, areaSlug: s.areaSlug })),
    limitMin: dayMinutesLimit(pace, DAILY_HOURS),
  });

  return { ...data.trip, pace, stops: data.stops, offers: data.offers, bookings: data.bookings, activeShareLink: data.activeShareLink, warnings };
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

// Chip "Scegli dove dormire" e "Confronta noleggi" della checklist del viaggio (passo 3.1).
// status: "ready" con href firmato; "coming_soon" se il partner non è pronto ("in arrivo");
// "missing_data" se al viaggio manca un dato (zona, date, aeroporto).
export type VerticalChip = { status: "ready" | "coming_soon" | "missing_data"; href: string | null };
export type TripVerticalChips = { lodging: VerticalChip; car: VerticalChip };

const MISSING_DATA: VerticalChip = { status: "missing_data", href: null };

async function chipFor(input: VerticalSearchInput | null): Promise<VerticalChip> {
  if (input === null) return MISSING_DATA;
  const href = await verticalSearchHref(input);
  return href === null ? { status: "coming_soon", href: null } : { status: "ready", href };
}

// Alloggio: zona della prima notte (itinerary_nights; senza notta, la zona delle tappe del primo
// giorno), date dal primo giorno, persone (senza numero: 2). Noleggio: aeroporto di arrivo di
// user_constraints, altrimenti il più vicino alle tappe del primo giorno; date di inizio e fine.
export async function getTripVerticalChips(
  user: DbUser,
  tripId: string,
  locale: string,
): Promise<TripVerticalChips | null> {
  const data = await dbAsUser(user, async (tx) => {
    const [trip] = await tx
      .select({ id: itineraries.id, startDate: itineraries.startDate, days: itineraries.days, travelers: itineraries.travelers })
      .from(itineraries)
      .where(and(eq(itineraries.id, tripId), eq(itineraries.isTemplate, false)));
    if (!trip) return null;

    const [night] = await tx
      .select({ placeName: places.name, areaIt: areas.nameIt, areaEn: areas.nameEn })
      .from(itineraryNights)
      .leftJoin(areas, eq(areas.id, itineraryNights.areaId))
      .leftJoin(places, eq(places.id, itineraryNights.placeId))
      .where(and(eq(itineraryNights.itineraryId, tripId), eq(itineraryNights.nightIndex, 1)));

    const dayZero = await tx
      .select({ areaIt: areas.nameIt, areaEn: areas.nameEn, lat: places.lat, lng: places.lng })
      .from(itineraryItems)
      .leftJoin(activities, eq(activities.id, itineraryItems.activityId))
      .leftJoin(places, eq(places.id, sql`coalesce(${itineraryItems.placeId}, ${activities.placeId})`))
      .leftJoin(areas, eq(areas.id, places.areaId))
      .where(and(eq(itineraryItems.itineraryId, tripId), eq(itineraryItems.dayIndex, 0)))
      .orderBy(asc(itineraryItems.position));

    const [constraints] = await tx
      .select({ arrivalAirport: userConstraints.arrivalAirport })
      .from(userConstraints)
      .where(eq(userConstraints.userId, user.id));

    return { trip, night: night ?? null, dayZero, arrivalAirport: constraints?.arrivalAirport ?? null };
  });
  if (!data) return null;

  const isEn = locale === "en";
  const nightLabel = data.night ? (data.night.placeName ?? (isEn ? data.night.areaEn : data.night.areaIt)) : null;
  const dayZeroLabel =
    data.dayZero.map((row) => (isEn ? row.areaEn : row.areaIt)).find((name): name is string => !!name) ?? null;
  const lodgingQuery = nightLabel ?? dayZeroLabel;

  const checkin = data.trip.startDate;
  const checkout = checkin ? addDays(checkin, Math.max(1, data.trip.days - 1)) : null;
  const adults = data.trip.travelers ?? 2;

  const lodgingInput: VerticalSearchInput | null =
    lodgingQuery && checkin && checkout
      ? { vertical: "lodging", query: lodgingQuery, airport: "", checkin, checkout, adults, context: "itinerary", itineraryId: tripId, locale }
      : null;

  const points = data.dayZero.flatMap((row) => (row.lat !== null && row.lng !== null ? [{ lat: row.lat, lng: row.lng }] : []));
  const arrival = data.arrivalAirport;
  const airport = arrival !== null && isSicilyAirport(arrival) ? arrival : nearestSicilyAirport(points);
  const carInput: VerticalSearchInput | null =
    airport && checkin && checkout
      ? { vertical: "car", query: "", airport, checkin, checkout, adults, context: "itinerary", itineraryId: tripId, locale }
      : null;

  return { lodging: await chipFor(lodgingInput), car: await chipFor(carInput) };
}

// Il viaggio pubblico: solo ciò che public.shared_itinerary restituisce (mai proprietario,
// email, prenotazioni o gruppo). Token non valido o revocato: null.
const sharedStopSchema = z.object({
  day_index: z.number().int(),
  position: z.number().int(),
  time_slot: z.enum(TIME_SLOTS).nullable(),
  notes: z.string().nullable(),
  title: z.string().nullable(),
  activity_slug: z.string().nullable(),
  place_name: z.string().nullable(),
});

const sharedTripSchema = z.object({
  title: z.string(),
  days: z.number().int(),
  start_date: z.iso.date().nullable(),
  travelers: z.number().int().nullable(),
  day_titles: z.array(z.string()),
  day_notes: z.array(z.string()),
  stops: z.array(sharedStopSchema),
});

export type SharedStop = {
  dayIndex: number;
  position: number;
  timeSlot: TimeSlot | null;
  notes: string | null;
  title: string | null;
  activitySlug: string | null;
  placeName: string | null;
};

export type SharedTrip = {
  title: string;
  days: number;
  startDate: string | null;
  travelers: number | null;
  dayTitles: string[];
  dayNotes: string[];
  stops: SharedStop[];
};

// Il token è base64url di 32 byte: 43 caratteri. Altro formato: nessuna query.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export async function getSharedTrip(token: string): Promise<SharedTrip | null> {
  if (!TOKEN_FORMAT.test(token)) return null;
  const rows = await dbPublic((tx) => tx.execute<{ trip: unknown }>(sql`select public.shared_itinerary(${token}) as trip`));
  const parsed = sharedTripSchema.nullable().safeParse(rows[0]?.trip ?? null);
  if (!parsed.success || parsed.data === null) return null;
  const trip = parsed.data;
  return {
    title: trip.title,
    days: trip.days,
    startDate: trip.start_date,
    travelers: trip.travelers,
    dayTitles: trip.day_titles,
    dayNotes: trip.day_notes,
    stops: trip.stops.map((s) => ({
      dayIndex: s.day_index,
      position: s.position,
      timeSlot: s.time_slot,
      notes: s.notes,
      title: s.title,
      activitySlug: s.activity_slug,
      placeName: s.place_name,
    })),
  };
}
