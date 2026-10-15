import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { SICILY_AIRPORT_CODES, SICILY_AIRPORTS } from "@/lib/flights/airports";
import { activities, areas, places } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";
import { affiliateLinkSecret, VERTICAL_LINK_TTL_SECONDS } from "./config";
import { getPartnerConfig, readyPartner, VERTICAL_PARTNER } from "./partners";
import {
  buildVerticalUrl,
  verticalLinkHref,
  type Vertical,
  type VerticalContext,
  type VerticalLink,
} from "./vertical-links";

// Dati e link delle pagine di alloggi (/dove-dormire) e noleggi (/noleggio-auto), e dei chip del
// viaggio. "in arrivo" = il partner non è pronto (manca l'ID nell'ambiente, il partner è inattivo,
// la chiave dei link non c'è): nessun link, nessun host costruito.

export type VerticalSearchInput = {
  vertical: Vertical;
  query: string;
  airport: string;
  checkin: string;
  checkout: string;
  adults: number;
  context: VerticalContext;
  itineraryId: string | null;
  locale: string;
};

// Subid di prova per verificare che il template regga; il subid reale lo crea la route al click.
const PROBE_SUBID = "probeprobeprobe";

// Href firmato verso /api/go/v, o null se la verticale non è pronta o la ricerca non si può
// costruire (per esempio manca l'area).
export async function verticalSearchHref(input: VerticalSearchInput): Promise<string | null> {
  const secret = affiliateLinkSecret();
  if (!secret) return null;
  const ready = readyPartner(await getPartnerConfig(VERTICAL_PARTNER[input.vertical]), input.vertical);
  if (!ready) return null;

  const values = {
    query: input.query,
    airport: input.airport,
    checkin: input.checkin,
    checkout: input.checkout,
    adults: String(input.adults),
    partner_id: ready.partnerId,
    locale: input.locale,
  };
  if (buildVerticalUrl(ready.config, { ...values, subid: PROBE_SUBID }) === null) return null;

  const link: VerticalLink = {
    partner: ready.config.partner,
    vertical: input.vertical,
    query: input.query,
    airport: input.airport,
    checkin: input.checkin,
    checkout: input.checkout,
    adults: input.adults,
    context: input.context,
    itineraryId: input.itineraryId,
    expiresAt: Math.floor(Date.now() / 1000) + VERTICAL_LINK_TTL_SECONDS,
  };
  try {
    return verticalLinkHref(link, secret, input.locale);
  } catch {
    return null;
  }
}

// "ready" se la verticale può già mandare utenti al partner, altrimenti "coming_soon".
export async function verticalAvailability(vertical: Vertical): Promise<"ready" | "coming_soon"> {
  if (!affiliateLinkSecret()) return "coming_soon";
  const ready = readyPartner(await getPartnerConfig(VERTICAL_PARTNER[vertical]), vertical);
  return ready ? "ready" : "coming_soon";
}

// Aree di viaggio e le città (luoghi attivi) con più attività attive per area, al massimo tre per area.
export type LodgingArea = { slug: string; name: string };
export type LodgingCity = { slug: string; name: string; areaSlug: string };

const CITIES_PER_AREA = 3;

export async function getLodgingPageData(locale: string): Promise<{ areas: LodgingArea[]; cities: LodgingCity[] }> {
  const isEn = locale === "en";
  const areaRows = await dbPublic((tx) =>
    tx
      .select({ slug: areas.slug, nameIt: areas.nameIt, nameEn: areas.nameEn })
      .from(areas)
      .orderBy(asc(areas.sort), asc(areas.slug)),
  );
  // Una sola query: il conteggio delle attività serve solo per l'ordine.
  const placeRows = await dbPublic((tx) =>
    tx
      .select({ slug: places.slug, name: places.name, areaSlug: areas.slug })
      .from(places)
      .innerJoin(areas, eq(areas.id, places.areaId))
      .innerJoin(activities, and(eq(activities.placeId, places.id), eq(activities.isActive, true)))
      .where(eq(places.isActive, true))
      .groupBy(places.id, places.slug, places.name, areas.slug, areas.sort)
      .orderBy(asc(areas.sort), desc(sql`count(${activities.id})`), asc(places.name)),
  );

  const perArea = new Map<string, number>();
  const cities: LodgingCity[] = [];
  for (const row of placeRows) {
    const taken = perArea.get(row.areaSlug) ?? 0;
    if (taken >= CITIES_PER_AREA) continue;
    perArea.set(row.areaSlug, taken + 1);
    cities.push({ slug: row.slug, name: row.name, areaSlug: row.areaSlug });
  }
  return {
    areas: areaRows.map((area) => ({ slug: area.slug, name: isEn ? area.nameEn : area.nameIt })),
    cities,
  };
}

// Aeroporti siciliani per la ricerca di noleggio (dati statici, nessuna lettura dal database).
export type CarAirport = { iata: string; name: string; city: string };

export function carAirports(locale: string): CarAirport[] {
  const isEn = locale === "en";
  return SICILY_AIRPORT_CODES.map((code) => {
    const airport = SICILY_AIRPORTS[code];
    return {
      iata: airport.iata,
      name: isEn ? airport.name.en : airport.name.it,
      city: isEn ? airport.city.en : airport.city.it,
    };
  });
}
