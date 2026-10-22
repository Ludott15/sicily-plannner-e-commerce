import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { dbPublic } from "@/server/db/public";
import { placeLegs } from "@/server/db/schema";
import type { LegPair, RouteLeg } from "@/lib/maps/legs";

// Lettura delle tratte salvate in place_legs, con dbPublic (ruolo anon: la RLS concede la lettura).
// Le coppie senza riga non compaiono nel risultato: la pagina mostra la tratta "in calcolo".

const MAX_PAIRS = 200;
const uuid = z.uuid();
const geometrySchema = z.array(z.tuple([z.number(), z.number()])).min(2);

function pairKey(from: string, to: string): string {
  return `${from.toLowerCase()}>${to.toLowerCase()}`;
}

export async function getLegs(pairs: readonly LegPair[]): Promise<RouteLeg[]> {
  const valid = pairs
    .filter((pair) => uuid.safeParse(pair.from).success && uuid.safeParse(pair.to).success)
    .filter((pair) => pair.from.toLowerCase() !== pair.to.toLowerCase())
    .slice(0, MAX_PAIRS);
  if (valid.length === 0) return [];

  const keys = sql.join(
    valid.map((pair) => sql`(${pair.from}::uuid, ${pair.to}::uuid)`),
    sql`, `,
  );
  const rows = await dbPublic((tx) =>
    tx
      .select({
        fromPlaceId: placeLegs.fromPlaceId,
        toPlaceId: placeLegs.toPlaceId,
        distanceM: placeLegs.distanceM,
        durationS: placeLegs.durationS,
        geometry: placeLegs.geometry,
      })
      .from(placeLegs)
      .where(sql`(${placeLegs.fromPlaceId}, ${placeLegs.toPlaceId}) in (${keys})`),
  );

  const byKey = new Map<string, RouteLeg>();
  for (const row of rows) {
    const geometry = geometrySchema.safeParse(row.geometry);
    if (!geometry.success) continue;
    byKey.set(pairKey(row.fromPlaceId, row.toPlaceId), {
      fromPlaceId: row.fromPlaceId,
      toPlaceId: row.toPlaceId,
      distanceM: row.distanceM,
      durationS: row.durationS,
      coordinates: geometry.data,
    });
  }

  // Nell'ordine delle coppie richieste, senza duplicati.
  const seen = new Set<string>();
  const legs: RouteLeg[] = [];
  for (const pair of valid) {
    const key = pairKey(pair.from, pair.to);
    const leg = byKey.get(key);
    if (leg && !seen.has(key)) {
      seen.add(key);
      legs.push(leg);
    }
  }
  return legs;
}
