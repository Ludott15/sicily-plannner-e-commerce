import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/server/auth";
import { coverJson, areaCoverJson } from "@/server/catalog/covers";
import { dbAdmin } from "@/server/db/admin";
import { activities, itineraries, itineraryItems, places } from "@/server/db/schema";
import { itineraryCoverChain, placeCoverChain } from "@/lib/media";
import type { VerticalContent } from "./vertical-image";

// Contenuto dell'immagine verticale (admin): un itinerario pronto (titolo, una riga per giorno
// con il titolo del giorno o i luoghi delle sue tappe) oppure un luogo (le sue attività attive).
// Legge anche le bozze: è uno strumento dell'admin, l'immagine non va pubblicata da sola.
// Ogni funzione verifica l'admin prima di leggere; un id che non esiste dà null.

const MAX_DAY_STOPS = 3;
const MAX_PLACE_ACTIVITIES = 6;

export async function adminVerticalItinerary(id: string): Promise<VerticalContent | null> {
  await requireAdmin();
  const [row] = await dbAdmin
    .select({
      title: itineraries.title,
      days: itineraries.days,
      dayTitles: itineraries.dayTitles,
      ownCover: coverJson(itineraries.coverMediaId),
    })
    .from(itineraries)
    .where(and(eq(itineraries.id, id), eq(itineraries.isTemplate, true)));
  if (!row) return null;

  const items = await dbAdmin
    .select({
      dayIndex: itineraryItems.dayIndex,
      placeId: places.id,
      placeName: places.name,
      placeCover: coverJson(places.coverMediaId),
      areaCover: areaCoverJson(places.areaId),
      activityTitle: activities.title,
      customTitle: itineraryItems.customTitle,
    })
    .from(itineraryItems)
    .leftJoin(places, eq(places.id, itineraryItems.placeId))
    .leftJoin(activities, eq(activities.id, itineraryItems.activityId))
    .where(eq(itineraryItems.itineraryId, id))
    .orderBy(asc(itineraryItems.dayIndex), asc(itineraryItems.position));

  const lines: VerticalContent["lines"] = [];
  for (let day = 0; day < row.days; day++) {
    const dayItems = items.filter((item) => item.dayIndex === day);
    const names = dayItems
      .map((item) => item.placeName ?? item.activityTitle ?? item.customTitle)
      .filter((name): name is string => Boolean(name));
    const text = row.dayTitles[day] || [...new Set(names)].slice(0, MAX_DAY_STOPS).join(" · ");
    if (text) lines.push({ day: day + 1, text });
  }

  const firstStop = items.find((item) => item.placeId !== null);
  const chain = itineraryCoverChain({
    own: row.ownCover,
    firstStop: firstStop?.placeCover,
    area: firstStop?.areaCover,
  });
  return {
    kind: "itinerario",
    title: row.title,
    days: row.days,
    province: "",
    lines,
    cover: chain?.media ?? null,
  };
}

export async function adminVerticalPlace(id: string): Promise<VerticalContent | null> {
  await requireAdmin();
  const [place] = await dbAdmin
    .select({
      name: places.name,
      province: places.province,
      ownCover: coverJson(places.coverMediaId),
      areaCover: areaCoverJson(places.areaId),
    })
    .from(places)
    .where(eq(places.id, id));
  if (!place) return null;

  const rows = await dbAdmin
    .select({ title: activities.title })
    .from(activities)
    .where(and(eq(activities.placeId, id), eq(activities.isActive, true)))
    .orderBy(asc(activities.title))
    .limit(MAX_PLACE_ACTIVITIES);

  const chain = placeCoverChain({ own: place.ownCover, area: place.areaCover });
  return {
    kind: "luogo",
    title: place.name,
    days: 0,
    province: place.province,
    lines: rows.map((row) => ({ day: null, text: row.title })),
    cover: chain?.media ?? null,
  };
}

export async function adminVerticalContent(kind: "itinerario" | "luogo", id: string) {
  return kind === "itinerario" ? adminVerticalItinerary(id) : adminVerticalPlace(id);
}
