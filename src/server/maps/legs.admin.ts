import "server-only";
import { inArray, sql, type SQL } from "drizzle-orm";
import type { LegPair } from "@/lib/maps/legs";
import { dbAdmin } from "@/server/db/admin";
import { placeLegFailures, placeLegs, places } from "@/server/db/schema";
import { fetchRoute } from "./routing";

// Calcolo delle tratte mancanti (cron route-legs ogni ora e npm run maps:legs). Scrive con dbAdmin
// perché place_legs non ha grant di scrittura per i client. Il server demo di OSRM chiede una
// pausa tra una richiesta e l'altra: 1100 ms.
//
// Le coppie vengono solo dal catalogo e dai modelli, mai dai viaggi degli utenti (privacy):
//   1. priorità: le coppie consecutive degli itinerari modello (is_template), con luoghi attivi;
//   2. poi tutte le coppie ordinate di luoghi attivi diversi a meno di 150 km in linea d'aria.
// Una coppia che il router non risolve va in place_leg_failures e si salta per sette giorni.

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 1000;
const PAUSE_MS = 1100;

// Distanza massima in linea d'aria per le coppie del catalogo (le coppie dei modelli non hanno limite).
export const MAX_CATALOG_DISTANCE_KM = 150;
// Dopo un fallimento la coppia si riprova solo dopo questo numero di giorni.
export const FAILURE_RETRY_DAYS = 7;

export type ComputeLegsResult = { computed: number; failed: number };

// budgetMs: tempo massimo entro cui iniziare nuove richieste (il cron lo tiene sotto maxDuration).
// Di default nessun limite di tempo: lo script a riga di comando non lo imposta.
export type ComputeOptions = { pauseMs?: number; budgetMs?: number };

// Coppie ancora da calcolare: prima quelle dei modelli, poi quelle del catalogo entro la distanza
// massima. Esclude le coppie già salvate e quelle fallite da meno di FAILURE_RETRY_DAYS giorni.
export async function findMissingPairs(limit: number): Promise<LegPair[]> {
  const size = clampLimit(limit);
  const retryWindow = sql`make_interval(days => ${FAILURE_RETRY_DAYS})`;

  const templateRows = await dbAdmin.execute<{ from_place_id: string; to_place_id: string }>(sql`
    with stops as (
      select i.itinerary_id, i.day_index, i.position, coalesce(i.place_id, a.place_id) as place_id
      from public.itinerary_items i
      join public.itineraries t on t.id = i.itinerary_id and t.is_template
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
    join public.places pf on pf.id = p.from_place_id and pf.is_active
    join public.places pt on pt.id = p.to_place_id and pt.is_active
    where not exists (
      select 1 from public.place_legs l
      where l.from_place_id = p.from_place_id and l.to_place_id = p.to_place_id
    )
    and not exists (
      select 1 from public.place_leg_failures f
      where f.from_place_id = p.from_place_id and f.to_place_id = p.to_place_id
        and f.failed_at > now() - ${retryWindow}
    )
    order by random()
    limit ${size}
  `);
  const template = templateRows.map((row) => ({ from: row.from_place_id, to: row.to_place_id }));
  if (template.length >= size) return template;

  const exclude: SQL = template.length
    ? sql`and (a.id, b.id) not in (${sql.join(
        template.map((pair) => sql`(${pair.from}::uuid, ${pair.to}::uuid)`),
        sql`, `,
      )})`
    : sql``;
  const catalogRows = await dbAdmin.execute<{ from_place_id: string; to_place_id: string }>(sql`
    select a.id as from_place_id, b.id as to_place_id
    from public.places a
    join public.places b on b.id <> a.id and b.is_active
    where a.is_active
      and 2 * 6371 * asin(sqrt(
            power(sin(radians(b.lat - a.lat) / 2), 2)
            + cos(radians(a.lat)) * cos(radians(b.lat)) * power(sin(radians(b.lng - a.lng) / 2), 2)
          )) < ${MAX_CATALOG_DISTANCE_KM}
      and not exists (
        select 1 from public.place_legs l
        where l.from_place_id = a.id and l.to_place_id = b.id
      )
      and not exists (
        select 1 from public.place_leg_failures f
        where f.from_place_id = a.id and f.to_place_id = b.id
          and f.failed_at > now() - ${retryWindow}
      )
      ${exclude}
    order by random()
    limit ${size - template.length}
  `);
  const catalog = catalogRows.map((row) => ({ from: row.from_place_id, to: row.to_place_id }));
  return [...template, ...catalog];
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
// del router: la coppia va in place_leg_failures (riprovata dopo FAILURE_RETRY_DAYS giorni) e conta in
// failed. Si ferma prima se il tempo previsto supera budgetMs.
export async function computeMissingLegs(
  limit = DEFAULT_LIMIT,
  options: ComputeOptions = {},
): Promise<ComputeLegsResult> {
  const pauseMs = options.pauseMs ?? PAUSE_MS;
  const budgetMs = options.budgetMs ?? Number.POSITIVE_INFINITY;
  const started = Date.now();

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
    if (requests > 0 && Date.now() - started + pauseMs > budgetMs) break;
    if (requests > 0 && pauseMs > 0) await sleep(pauseMs);
    requests += 1;

    const route = await fetchRoute(from, to);
    if (!route) {
      await dbAdmin
        .insert(placeLegFailures)
        .values({ fromPlaceId: pair.from, toPlaceId: pair.to })
        .onConflictDoUpdate({
          target: [placeLegFailures.fromPlaceId, placeLegFailures.toPlaceId],
          set: { failedAt: sql`now()` },
        });
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
    await dbAdmin
      .delete(placeLegFailures)
      .where(sql`(${placeLegFailures.fromPlaceId}, ${placeLegFailures.toPlaceId}) = (${pair.from}::uuid, ${pair.to}::uuid)`);
  }
  return { computed, failed };
}
