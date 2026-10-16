import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { CHAT_TOOL_NAMES, type ChatToolName, type ItineraryChange } from "@/lib/chat/events";
import { SICILY_AIRPORT_CODES } from "@/lib/flights/airports";
import { MAX_TRIP_DAYS } from "@/lib/trip-days";
import { partnerName } from "@/server/affiliates/links";
import { listInterests } from "@/server/catalog/queries";
import { getGroupPreferences } from "@/server/groups/aggregate";
import { itineraries } from "@/server/db/schema";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";
import { areaNames, driveTimesBySlug, engineCatalog, getSavedPreferences, toProfile } from "@/server/personalization/data";
import { proposeTrips, type CatalogActivity, type Profile } from "@/server/personalization/engine";
import { searchFlights } from "@/server/flights/search";
import { tripStopsTx } from "@/server/trips/changes";
import { activityDetail, activityTitles, searchableCatalog, searchProducts } from "./catalog";
import { catalogDataBlock, clip } from "./text";

// Strumenti del chatbot (passo 9.1). Ogni strumento: input validato con Zod, dati presi con le
// letture pubbliche o con dbAsUser (RLS), risultato come blocco <dati_catalogo> escapato. Le
// modifiche non si applicano qui: create una proposta in attesa (PendingProposal), salvata a fine
// turno e applicata solo se l'utente la accetta.

export type ChatLocale = "it" | "en";

export type PendingProposal =
  | {
      kind: "itinerary";
      payload: { itineraryId: string; changes: ItineraryChange[]; asGroupProposal: boolean };
    }
  | {
      kind: "preference";
      payload: { interestKey: string; interestLabel: string; from: number; to: number; reason: string };
    };

export type ToolState = {
  user: DbUser;
  locale: ChatLocale;
  itineraryId: string | null;
  // Id restituiti dagli strumenti di questa sessione (storico e turno): solo questi si citano o si usano.
  knownActivityIds: Set<string>;
  knownStopIds: Set<string>;
  pending: PendingProposal[];
};

export type ToolRun = {
  result: string;
  isError: boolean;
  activityIds: string[];
  stopIds: string[];
};

const interestKey = z.string().regex(/^[a-z_]{1,40}$/);
const areaSlug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);
const dayIndex = z.number().int().min(0).max(MAX_TRIP_DAYS - 1);

const schemas = {
  get_user_profile: z.object({}),
  search_activities: z.object({
    query: z.string().trim().max(80).optional(),
    interestKey: interestKey.optional(),
    area: areaSlug.optional(),
    maxPriceEur: z.number().min(0).max(5000).optional(),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  get_activity: z.object({ activityId: z.uuid() }),
  search_flights: z.object({
    origin: z.string().regex(/^[A-Z]{3}$/),
    destinations: z.array(z.enum(SICILY_AIRPORT_CODES)).min(1).max(6),
    departure: z.iso.date(),
    returnDate: z.iso.date().nullable().optional(),
  }),
  propose_itinerary: z.object({ area: areaSlug.optional(), days: z.number().int().min(1).max(14).optional() }),
  get_itinerary: z.object({ itineraryId: z.uuid().optional() }),
  apply_itinerary_changes: z.object({
    changes: z
      .array(
        z.discriminatedUnion("op", [
          z.object({ op: z.literal("add"), activityId: z.uuid(), dayIndex }),
          z.object({ op: z.literal("remove"), stopId: z.uuid() }),
          z.object({ op: z.literal("move"), stopId: z.uuid(), dayIndex, position: z.number().int().min(0).max(99) }),
        ]),
      )
      .min(1)
      .max(10),
  }),
  suggest_preference_update: z.object({
    interestKey,
    weight: z.number().int().min(0).max(5),
    reason: z.string().trim().min(1).max(200),
  }),
  search_products: z.object({ query: z.string().trim().min(1).max(80) }),
} as const satisfies Record<ChatToolName, z.ZodType>;

const dayProperty = { type: "integer", minimum: 0, maximum: MAX_TRIP_DAYS - 1, description: "Giorno del viaggio, 0 = primo giorno." };
const uuidProperty = (description: string) => ({ type: "string", format: "uuid", description });

// Definizioni per l'API. Ordine fisso (la cache del prompt dipende dall'ordine).
export const CHAT_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_user_profile",
    description:
      "Preferenze dell'utente (interessi con pesi, ritmo, giorni, budget) e, se la chat è legata a un viaggio di gruppo, le preferenze aggregate del gruppo. Mai i gusti di un singolo altro membro.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_activities",
    description:
      "Cerca attività attive del catalogo. Restituisce id, titolo, luogo, area, durata, prezzo indicativo e descrizione breve. Filtri opzionali: testo libero, interesse, area, prezzo massimo.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 80 },
        interestKey: { type: "string", description: "Chiave di interesse, es. sea, food_wine, villages." },
        area: { type: "string", description: "Slug dell'area di viaggio." },
        maxPriceEur: { type: "number", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_activity",
    description: "Scheda completa di un'attività per id: descrizione, offerte dei partner, recensioni pubbliche recenti.",
    input_schema: {
      type: "object",
      properties: { activityId: uuidProperty("Id dell'attività, restituito da search_activities o propose_itinerary.") },
      required: ["activityId"],
      additionalProperties: false,
    },
  },
  {
    name: "search_flights",
    description:
      "Prezzo indicativo in euro del volo più economico per ciascun aeroporto della Sicilia scelto, con data di aggiornamento. origin è il codice IATA di partenza (3 lettere).",
    input_schema: {
      type: "object",
      properties: {
        origin: { type: "string", pattern: "^[A-Z]{3}$" },
        destinations: { type: "array", items: { type: "string", enum: [...SICILY_AIRPORT_CODES] }, minItems: 1, maxItems: 6 },
        departure: { type: "string", format: "date" },
        returnDate: { type: ["string", "null"], format: "date" },
      },
      required: ["origin", "destinations", "departure"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_itinerary",
    description:
      "Bozze di viaggio dentro un'area, calcolate sul profilo dell'utente. Serve l'area o il profilo completo (onboarding).",
    input_schema: {
      type: "object",
      properties: {
        area: { type: "string", description: "Slug dell'area di viaggio." },
        days: { type: "integer", minimum: 1, maximum: 14 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_itinerary",
    description: "Tappe del viaggio collegato alla chat (o di quello indicato): id delle tappe, giorno, titolo.",
    input_schema: {
      type: "object",
      properties: { itineraryId: uuidProperty("Id del viaggio. Se manca, quello collegato alla chat.") },
      additionalProperties: false,
    },
  },
  {
    name: "apply_itinerary_changes",
    description:
      "Propone modifiche al viaggio: aggiungere un'attività (id da una ricerca di questa conversazione), togliere o spostare una tappa (id da get_itinerary). Non applica nulla: l'utente accetta o rifiuta la proposta.",
    input_schema: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: {
            anyOf: [
              {
                type: "object",
                properties: { op: { const: "add" }, activityId: uuidProperty("Id dell'attività."), dayIndex: dayProperty },
                required: ["op", "activityId", "dayIndex"],
                additionalProperties: false,
              },
              {
                type: "object",
                properties: { op: { const: "remove" }, stopId: uuidProperty("Id della tappa.") },
                required: ["op", "stopId"],
                additionalProperties: false,
              },
              {
                type: "object",
                properties: {
                  op: { const: "move" },
                  stopId: uuidProperty("Id della tappa."),
                  dayIndex: dayProperty,
                  position: { type: "integer", minimum: 0, maximum: 99, description: "Posizione nel giorno, 0 = prima." },
                },
                required: ["op", "stopId", "dayIndex", "position"],
                additionalProperties: false,
              },
            ],
          },
        },
      },
      required: ["changes"],
      additionalProperties: false,
    },
  },
  {
    name: "suggest_preference_update",
    description:
      "Propone di cambiare il peso (0-5) di un interesse nei gusti dell'utente, con il motivo. L'utente accetta o rifiuta.",
    input_schema: {
      type: "object",
      properties: {
        interestKey: { type: "string" },
        weight: { type: "integer", minimum: 0, maximum: 5 },
        reason: { type: "string", maxLength: 200 },
      },
      required: ["interestKey", "weight", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "search_products",
    description: "Prodotti attivi dei produttori che corrispondono al testo (nome o descrizione).",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", minLength: 1, maxLength: 80 } },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

// Il controllo dell'elenco: stesso ordine e stessi nomi degli strumenti dell'evento.
if (CHAT_TOOL_DEFINITIONS.map((tool) => tool.name).join() !== CHAT_TOOL_NAMES.join()) {
  throw new Error("chat_tool_definitions_mismatch");
}

function result(data: Record<string, unknown>, activityIds: string[] = [], stopIds: string[] = []): ToolRun {
  return { result: catalogDataBlock(data), isError: false, activityIds, stopIds };
}

function failure(code: string): ToolRun {
  return { result: catalogDataBlock({ status: "error", code }), isError: true, activityIds: [], stopIds: [] };
}

type ItineraryInfo = { id: string; title: string; days: number; groupId: string | null; ownerId: string | null };

async function itineraryInfo(user: DbUser, id: string): Promise<ItineraryInfo | null> {
  return dbAsUser(user, async (tx) => {
    const [row] = await tx
      .select({
        id: itineraries.id,
        title: itineraries.title,
        days: itineraries.days,
        groupId: itineraries.groupId,
        ownerId: itineraries.ownerId,
      })
      .from(itineraries)
      .where(eq(itineraries.id, id));
    return row ?? null;
  });
}

async function labelsOf(locale: ChatLocale): Promise<Map<string, string>> {
  const rows = await listInterests();
  return new Map(rows.map((row) => [row.key, locale === "en" ? row.labelEn : row.labelIt]));
}

async function getUserProfile(state: ToolState): Promise<ToolRun> {
  const saved = await getSavedPreferences(state.user);
  const labels = await labelsOf(state.locale);
  const own = saved?.completed
    ? {
        completed: true,
        pace: saved.pace,
        days: saved.days,
        months: saved.months,
        party: saved.party,
        budgetPerDayEur: saved.budgetPerDayEur,
        car: saved.car,
        airport: saved.airport,
        interests: Object.entries(saved.weights).map(([key, weight]) => ({ key, label: labels.get(key) ?? key, weight })),
        ...(saved.sensitiveConsent ? { reducedMobility: saved.reducedMobility, diet: saved.diet } : {}),
      }
    : { completed: false };

  let group: Record<string, unknown> | null = null;
  if (state.itineraryId) {
    const trip = await itineraryInfo(state.user, state.itineraryId);
    if (trip?.groupId) {
      try {
        const prefs = await getGroupPreferences(state.user, trip.groupId);
        group = {
          members: prefs.members,
          withPreferences: prefs.withPreferences,
          private: prefs.private,
          constraints: prefs.constraints,
          interests: prefs.private
            ? []
            : Object.entries(prefs.weights).map(([key, weight]) => ({ key, label: labels.get(key) ?? key, weight })),
        };
      } catch {
        group = null;
      }
    }
  }
  return result({ status: "ok", profile: own, group });
}

type CatalogHit = Awaited<ReturnType<typeof searchableCatalog>>[number];

function byRating(a: CatalogHit, b: CatalogHit): number {
  if (a.rating === b.rating) return a.title.localeCompare(b.title);
  if (a.rating === null) return 1;
  if (b.rating === null) return -1;
  return b.rating - a.rating;
}

async function searchActivities(state: ToolState, input: z.infer<typeof schemas.search_activities>): Promise<ToolRun> {
  const terms = (input.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const rows = await searchableCatalog();
  const hits = rows
    .filter((row) => {
      if (input.area && row.area !== input.area) return false;
      if (input.interestKey && !row.interests.some((tag) => tag.key === input.interestKey)) return false;
      const price = row.offerPriceFromEur ?? row.onSitePriceEur;
      if (input.maxPriceEur !== undefined && price !== null && price > input.maxPriceEur) return false;
      if (terms.length === 0) return true;
      const haystack = `${row.title} ${row.description ?? ""} ${row.placeName} ${row.area} ${row.interests.map((t) => t.key).join(" ")}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    })
    .sort(byRating)
    .slice(0, input.limit ?? 6);
  const activities = hits.map((row) => ({
    id: row.id,
    title: row.title,
    place: row.placeName,
    area: row.area,
    durationMinutes: row.durationMin,
    priceFromEur: row.offerPriceFromEur ?? row.onSitePriceEur,
    rating: row.rating,
    interests: row.interests.map((tag) => tag.key),
    description: clip(row.description ?? "", 280),
  }));
  const ids = activities.map((activity) => activity.id);
  ids.forEach((id) => state.knownActivityIds.add(id));
  return result({ status: "ok", activities }, ids);
}

async function getActivity(state: ToolState, input: z.infer<typeof schemas.get_activity>): Promise<ToolRun> {
  const detail = await activityDetail(input.activityId);
  if (!detail) return result({ status: "not_found" });
  const { activity, offers, reviews } = detail;
  state.knownActivityIds.add(activity.id);
  return result(
    {
      status: "ok",
      activity: {
        id: activity.id,
        title: activity.title,
        place: activity.placeName,
        durationMinutes: activity.durationMin,
        accessible: activity.accessible,
        requiresCar: activity.requiresCar,
        seasonMonths: activity.seasonMonths,
        rating: activity.rating === null ? null : Number(activity.rating),
        onSitePriceEur: activity.onSitePriceEur === null ? null : Number(activity.onSitePriceEur),
        description: clip(activity.description ?? "", 800),
        offers: offers.map((offer) => ({
          partner: partnerName(offer.partner),
          title: offer.title,
          priceFromEur: offer.priceFromEur,
          freeCancellation: offer.freeCancellation,
        })),
        reviews: reviews.map((review) => ({ rating: Number(review.rating), text: clip(review.body ?? "", 300) })),
      },
    },
    [activity.id],
  );
}

async function searchFlightsTool(state: ToolState, input: z.infer<typeof schemas.search_flights>): Promise<ToolRun> {
  const outcome = await searchFlights({
    origin: input.origin,
    destinations: input.destinations,
    departure: input.departure,
    returnDate: input.returnDate ?? null,
  });
  if (outcome.status !== "ok") return result({ status: outcome.status });
  return result({
    status: "ok",
    currency: "EUR",
    results: outcome.results.map((entry) => ({
      airport: entry.airport.iata,
      name: entry.airport.name[state.locale],
      best: entry.best
        ? {
            priceEur: entry.best.price,
            departureAt: entry.best.departureAt,
            returnAt: entry.best.returnAt,
            airline: entry.best.airline,
            transfers: entry.best.transfers,
            updatedAt: entry.best.updatedAt,
          }
        : null,
    })),
  });
}

async function proposeItinerary(state: ToolState, input: z.infer<typeof schemas.propose_itinerary>): Promise<ToolRun> {
  const saved = await getSavedPreferences(state.user);
  if (!saved?.completed) return result({ status: "needs_preferences" });
  const base: Profile = toProfile(saved);
  const profile: Profile = input.days === undefined ? base : { ...base, days: input.days };
  const [catalog, driveTimes, names] = await Promise.all([engineCatalog(), driveTimesBySlug(), areaNames(state.locale)]);
  const { proposals } = proposeTrips(catalog, profile, driveTimes);
  const chosen = proposals
    .filter((proposal) => !input.area || proposal.area === input.area || proposal.areas.includes(input.area))
    .slice(0, 3);
  const ids = new Set<string>();
  const drafts = chosen.map((proposal) => ({
    area: names.get(proposal.area) ?? proposal.area,
    areas: proposal.areas.map((area) => names.get(area) ?? area),
    needsCar: proposal.needsCar,
    days: proposal.days.map((day, index) => ({
      dayIndex: index,
      activities: day.activities.map((activity: CatalogActivity) => {
        ids.add(activity.id);
        return { id: activity.id, title: activity.title, place: activity.placeName, durationMinutes: activity.durationMin };
      }),
    })),
  }));
  const activityIds = [...ids];
  activityIds.forEach((id) => state.knownActivityIds.add(id));
  return result({ status: "ok", drafts }, activityIds);
}

async function getItinerary(state: ToolState, input: z.infer<typeof schemas.get_itinerary>): Promise<ToolRun> {
  const id = input.itineraryId ?? state.itineraryId;
  if (!id) return result({ status: "no_itinerary" });
  const data = await dbAsUser(state.user, async (tx: UserTx) => {
    const [trip] = await tx
      .select({ id: itineraries.id, title: itineraries.title, days: itineraries.days, groupId: itineraries.groupId, ownerId: itineraries.ownerId })
      .from(itineraries)
      .where(eq(itineraries.id, id));
    if (!trip) return null;
    const stops = await tripStopsTx(tx, id);
    return { trip, stops };
  });
  if (!data) return result({ status: "not_found" });
  const stopIds = data.stops.map((stop) => stop.id);
  stopIds.forEach((stopId) => state.knownStopIds.add(stopId));
  return result(
    {
      status: "ok",
      itinerary: {
        id: data.trip.id,
        title: data.trip.title,
        days: data.trip.days,
        shared: data.trip.groupId !== null,
        role: data.trip.ownerId === state.user.id ? "owner" : "member",
        stops: data.stops.map((stop) => ({ stopId: stop.id, dayIndex: stop.dayIndex, title: stop.title })),
      },
    },
    [],
    stopIds,
  );
}

async function applyItineraryChanges(state: ToolState, input: z.infer<typeof schemas.apply_itinerary_changes>): Promise<ToolRun> {
  if (!state.itineraryId) return failure("no_itinerary");
  const trip = await itineraryInfo(state.user, state.itineraryId);
  if (!trip) return failure("not_found");
  const isOwner = trip.ownerId === state.user.id;
  const asGroupProposal = trip.groupId !== null && !isOwner;

  const stops = await dbAsUser(state.user, (tx) => tripStopsTx(tx, trip.id));
  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const addedIds = input.changes.flatMap((change) => (change.op === "add" ? [change.activityId] : []));
  const titles = await activityTitles(addedIds);

  const changes: ItineraryChange[] = [];
  for (const change of input.changes) {
    if (change.op === "add") {
      if (!state.knownActivityIds.has(change.activityId)) return failure("unknown_activity");
      if (change.dayIndex >= trip.days) return failure("day_out_of_range");
      const title = titles.get(change.activityId);
      if (title === undefined) return failure("activity_not_available");
      changes.push({ op: "add", activityId: change.activityId, dayIndex: change.dayIndex, title });
      continue;
    }
    if (asGroupProposal) return failure("not_allowed_for_member");
    if (!state.knownStopIds.has(change.stopId)) return failure("unknown_stop");
    const stop = stopById.get(change.stopId);
    if (!stop) return failure("stop_not_found");
    if (change.op === "remove") {
      changes.push({ op: "remove", stopId: stop.id, title: stop.title });
      continue;
    }
    if (change.dayIndex >= trip.days) return failure("day_out_of_range");
    changes.push({ op: "move", stopId: stop.id, dayIndex: change.dayIndex, position: change.position, title: stop.title });
  }

  state.pending.push({ kind: "itinerary", payload: { itineraryId: trip.id, changes, asGroupProposal } });
  return result({
    status: "proposal_created",
    note: "La modifica non è ancora applicata: l'utente la accetta o la rifiuta.",
    changes: changes.map((change) => ({ op: change.op, title: change.title })),
  });
}

async function suggestPreferenceUpdate(state: ToolState, input: z.infer<typeof schemas.suggest_preference_update>): Promise<ToolRun> {
  const rows = await listInterests();
  const interest = rows.find((row) => row.key === input.interestKey);
  if (!interest) return failure("unknown_interest");
  const saved = await getSavedPreferences(state.user);
  const from = saved?.weights[input.interestKey] ?? 0;
  if (from === input.weight) return failure("no_change");
  const label = state.locale === "en" ? interest.labelEn : interest.labelIt;
  state.pending.push({
    kind: "preference",
    payload: { interestKey: interest.key, interestLabel: label, from, to: input.weight, reason: input.reason },
  });
  return result({ status: "proposal_created", interest: label, from, to: input.weight });
}

async function searchProductsTool(input: z.infer<typeof schemas.search_products>): Promise<ToolRun> {
  const rows = await searchProducts(input.query);
  return result({
    status: "ok",
    products: rows.map((row) => ({ slug: row.slug, title: row.title, priceEur: row.priceCents / 100, weightG: row.weightG })),
  });
}

function parse<K extends ChatToolName>(name: K, raw: unknown): z.infer<(typeof schemas)[K]> | null {
  const parsed = schemas[name].safeParse(raw);
  return parsed.success ? (parsed.data as z.infer<(typeof schemas)[K]>) : null;
}

// Esegue uno strumento. Input non valido o errore di dominio: risultato con isError, mai eccezioni
// verso il ciclo (un errore di database lancia e il turno si chiude con api_error).
export async function runChatTool(state: ToolState, name: ChatToolName, raw: unknown): Promise<ToolRun> {
  switch (name) {
    case "get_user_profile":
      return getUserProfile(state);
    case "search_activities": {
      const input = parse(name, raw);
      return input ? searchActivities(state, input) : failure("invalid_input");
    }
    case "get_activity": {
      const input = parse(name, raw);
      return input ? getActivity(state, input) : failure("invalid_input");
    }
    case "search_flights": {
      const input = parse(name, raw);
      return input ? searchFlightsTool(state, input) : failure("invalid_input");
    }
    case "propose_itinerary": {
      const input = parse(name, raw);
      return input ? proposeItinerary(state, input) : failure("invalid_input");
    }
    case "get_itinerary": {
      const input = parse(name, raw);
      return input ? getItinerary(state, input) : failure("invalid_input");
    }
    case "apply_itinerary_changes": {
      const input = parse(name, raw);
      return input ? applyItineraryChanges(state, input) : failure("invalid_input");
    }
    case "suggest_preference_update": {
      const input = parse(name, raw);
      return input ? suggestPreferenceUpdate(state, input) : failure("invalid_input");
    }
    case "search_products": {
      const input = parse(name, raw);
      return input ? searchProductsTool(input) : failure("invalid_input");
    }
  }
}

