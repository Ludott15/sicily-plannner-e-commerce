import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { SICILY_AIRPORT_CODES, SICILY_AIRPORTS } from "@/lib/flights/airports";
import { activities, areas, places } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";
import { affiliateLinkSecret, VERTICAL_LINK_TTL_SECONDS } from "./config";
import { getPartnerConfig, readyPartner, VERTICAL_PARTNER } from "./partners";
import { catalogPlaceName } from "./vertical-places";
import {
  destinationFor,
  isVerticalLocale,
  usesPlace,
  verticalFields,
  verticalLinkHref,
  VERTICAL_PARTNERS,
  type LodgingKind,
  type PassesSearch,
  type Vertical,
  type VerticalContext,
  type VerticalLink,
  type VerticalLocale,
} from "./vertical-links";
import { pageFor } from "./vertical-pages";

// Pagine delle verticali (alloggi, noleggi, traghetti, treni, transfer, biglietti, barche, assicurazione,
// eSIM, deposito bagagli): ricerca -> link firmato verso /api/go/v (buildVerticalHref). Il partner
// predefinito è il primo di VERTICAL_PARTNERS; "partner" sceglie un'alternativa della stessa verticale.
// "inactive" = il partner non può ricevere traffico (non attivo, senza template, senza chiave dei link);
// "invalid" = la ricerca non è valida (valori fuori dalle liste chiuse, luogo non nel catalogo).
// Un partner senza ID configurato è comunque "pronto": il link esce senza il parametro d'affiliazione.

type WithPartner = { partner?: string };

export type VerticalSearchInput =
  | ({ vertical: "lodging"; place: string; checkin: string; checkout: string; adults: number; kind?: LodgingKind | "" } & WithPartner)
  | ({ vertical: "car"; airport: string; checkin: string; checkout: string } & WithPartner)
  | ({ vertical: "ferry"; from: string; to: string; date: string; adults: number } & WithPartner)
  | ({ vertical: "train"; from: string; to: string; date: string } & WithPartner)
  | ({ vertical: "transfer"; airport: string; place: string; date: string } & WithPartner)
  | ({ vertical: "tickets"; place: string } & WithPartner)
  | ({ vertical: "boat"; place: string; date: string } & WithPartner)
  | ({ vertical: "insurance" } & WithPartner)
  | ({ vertical: "esim" } & WithPartner)
  | ({ vertical: "luggage"; place: string } & WithPartner);

// Dove nasce la ricerca: pagina, itinerario o chat, e la lingua della pagina di ripiego.
export type VerticalCallContext = {
  context: VerticalContext;
  itineraryId: string | null;
  locale: string;
};

// passesSearch: quanta ricerca arriva al partner con questo link ("full", "place", "none"). La pagina lo
// usa per dire onestamente cosa arriva (vedi vertical-pages.ts e vertical-links.ts passesSearchFor).
export type VerticalHrefResult =
  | { href: string; partnerName: string; passesSearch: PassesSearch }
  | { error: "inactive" | "invalid" };

// Subid di prova per verificare che il template regga; il subid reale lo crea la route al click.
const PROBE_SUBID = "probeprobeprobe";

function linkFromInput(
  input: VerticalSearchInput,
  ctx: VerticalCallContext,
  lang: VerticalLocale,
  expiresAt: number,
): VerticalLink {
  const base: VerticalLink = {
    partner: input.partner ?? VERTICAL_PARTNER[input.vertical],
    vertical: input.vertical,
    place: "",
    from: "",
    to: "",
    date: "",
    kind: "",
    airport: "",
    checkin: "",
    checkout: "",
    adults: 0,
    context: ctx.context,
    locale: lang,
    itineraryId: ctx.itineraryId,
    expiresAt,
  };
  switch (input.vertical) {
    case "lodging":
      return { ...base, place: input.place, checkin: input.checkin, checkout: input.checkout, adults: input.adults, kind: input.kind ?? "" };
    case "car":
      return { ...base, airport: input.airport, checkin: input.checkin, checkout: input.checkout };
    case "ferry":
      return { ...base, from: input.from, to: input.to, date: input.date, adults: input.adults };
    case "train":
      return { ...base, from: input.from, to: input.to, date: input.date };
    case "transfer":
      return { ...base, airport: input.airport, place: input.place, date: input.date };
    case "tickets":
      return { ...base, place: input.place };
    case "boat":
      return { ...base, place: input.place, date: input.date };
    case "insurance":
    case "esim":
      return base;
    case "luggage":
      return { ...base, place: input.place };
  }
}

// Href firmato verso /api/go/v per una ricerca di verticale. Nessun parametro di input diventa host o
// percorso: il link porta solo campi validati dalle liste chiuse e lo slug del catalogo.
export async function buildVerticalHref(input: VerticalSearchInput, ctx: VerticalCallContext): Promise<VerticalHrefResult> {
  const vertical: Vertical = input.vertical;
  if (!isVerticalLocale(ctx.locale)) return { error: "invalid" };
  const lang: VerticalLocale = ctx.locale;
  let link: VerticalLink;
  try {
    link = linkFromInput(input, ctx, lang, Math.floor(Date.now() / 1000) + VERTICAL_LINK_TTL_SECONDS);
    verticalFields(link);
  } catch {
    return { error: "invalid" };
  }
  if (!(VERTICAL_PARTNERS[vertical] as readonly string[]).includes(link.partner)) return { error: "invalid" };

  const secret = affiliateLinkSecret();
  if (!secret) return { error: "inactive" };

  let ready: Awaited<ReturnType<typeof readyPartner>>;
  let placeName: string | null = null;
  try {
    ready = readyPartner(await getPartnerConfig(link.partner), vertical);
    if (!ready) return { error: "inactive" };
    if (usesPlace(vertical)) {
      placeName = await catalogPlaceName(link.place, ctx.locale, vertical === "lodging");
      if (placeName === null) return { error: "invalid" };
    }
  } catch {
    return { error: "inactive" };
  }

  const destination = destinationFor(link, ready.config, {
    placeName,
    partnerId: ready.partnerId,
    subid: PROBE_SUBID,
    locale: ctx.locale,
    page: pageFor(link),
  });
  if (destination === null) return { error: "inactive" };

  try {
    return {
      href: verticalLinkHref(link, secret),
      partnerName: ready.config.name,
      passesSearch: destination.passesSearch,
    };
  } catch {
    return { error: "inactive" };
  }
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
