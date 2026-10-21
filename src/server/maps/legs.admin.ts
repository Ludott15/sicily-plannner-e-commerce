import "server-only";
import { inArray, sql } from "drizzle-orm";
import type { LegPair } from "@/lib/maps/legs";
import { dbAdmin } from "@/server/db/admin";
import { placeLegs, places } from "@/server/db/schema";
import { fetchRoute } from "./routing";

// Calcolo delle tratte mancanti (cron route-legs ogni ora e npm run maps:legs). Scrive con dbAdmin
// perché place_legs non ha grant di scrittura per i client. Il server demo di OSRM chiede una
// pausa tra una richiesta e l'altra: 1100 ms.

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 1000;
const PAUSE_MS = 1100;

export type ComputeLegsResult = { computed: number; failed: number };

type ComputeOptions = { pauseMs?: number };

// Coppie consecutive di luoghi diversi in tutti gli itinerari (modello e viaggi utente), nell'ordine
// di giorno e posizione: include il passaggio dalla fine di un giorno all'inizio del successivo.
// Tappe senza luogo (titolo libero) si saltano. Solo le coppie che non hanno ancora una riga.
// L'ordine è casuale: così una coppia che il router non sa risolvere non blocca le altre al giro dopo.
export async function findMissingPairs(limit: number): Promise<LegPair[]> {
  const rows = await dbAdmin.execute<{ from_place_id: string; to_place_id: string }>(sql`
    with stops as (
      select i.itinerary_id, i.day_index, i.position, coalesce(i.place_id, a.place_id) as place_id
      from public.itinerary_items i
      left join public.activities a on a.id = i.activity_id
    ),
    known as (
      select
        place_id,
        lead(place_id) over (partition by itinerary_id order by day_index, position) as next_place_id
      from stops
      where place_id is not null
    ),
    pairs as (
      select distinct place_id as from_place_id, next_place_id as to_place_id
      from known
      where next_place_id is not null and next_place_id <> place_id
    )
    select p.from_place_id, p.to_place_id
    from pairs p
    where not exists (
      select 1 from public.place_legs l
      where l.from_place_id = p.from_place_id and l.to_place_id = p.to_place_id
    )
    order by random()
    limit ${limit}
  `);
  return rows.map((row) => ({ from: row.from_place_id, to: row.to_place_id }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT);
}

// Calcola fino a `limit` tratte mancanti. Idempotente: una coppia già salvata non si richiede di nuovo,
// e un inserimento concorrente non duplica la riga (on conflict do nothing). Non lancia per un errore
// del router: quella coppia conta in failed e si riprova al giro successivo.
export async function computeMissingLegs(
  limit = DEFAULT_LIMIT,
  options: ComputeOptions = {},
): Promise<ComputeLegsResult> {
  const pauseMs = options.pauseMs ?? PAUSE_MS;
  const pairs = await findMissingPairs(clampLimit(limit));
  if (pairs.length === 0) return { computed: 0, failed: 0 };

  const placeIds = [...new Set(pairs.flatMap((pair) => [pair.from, pair.to]))];
  const coordinateRows = await dbAdmin
    .select({ id: places.id, lat: places.lat, lng: places.lng })
    .from(places)
    .where(inArray(places.id, placeIds));
  const coordinates = new Map(coordinateRows.map((row) => [row.id, { lat: row.lat, lng: row.lng }]));

  let computed = 0;
  let failed = 0;
  let requests = 0;
  for (const pair of pairs) {
    const from = coordinates.get(pair.from);
    const to = coordinates.get(pair.to);
    if (!from || !to) {
      failed += 1;
      continue;
    }
    if (requests > 0 && pauseMs > 0) await sleep(pauseMs);
    requests += 1;

    const route = await fetchRoute(from, to);
    if (!route) {
      failed += 1;
      continue;
    }
    const inserted = await dbAdmin
      .insert(placeLegs)
      .values({
        fromPlaceId: pair.from,
        toPlaceId: pair.to,
        distanceM: route.distanceM,
        durationS: route.durationS,
        geometry: route.coordinates,
        source: "osrm",
      })
      .onConflictDoNothing({ target: [placeLegs.fromPlaceId, placeLegs.toPlaceId] })
      .returning({ fromPlaceId: placeLegs.fromPlaceId });
    computed += inserted.length;
  }
  return { computed, failed };
}
