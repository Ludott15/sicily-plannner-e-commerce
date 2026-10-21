import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { itineraries, itineraryItems, placeLegs, places } from "@/server/db/schema";
import { getLegs } from "./legs";
import { computeMissingLegs, findMissingPairs } from "./legs.admin";

// Tratte stradali su Postgres locale (npm run test:int). Il router è simulato con fetch: ogni
// richiesta restituisce una linea retta tra i due punti, tranne quelle dirette al luogo "guasto".
// Luoghi e itinerari sono di prova (int-…) e si cancellano alla fine; le tratte calcolate durante la
// suite si tolgono con il loro computed_at, perché computeMissingLegs guarda tutti gli itinerari.

const s = Date.now();
const startedAt = new Date(Date.now() - 1000);
const slug = (name: string) => `int-leg-${s}-${name}`;

const place = (lng: number, lat: number) => ({ province: "PA", lat, lng });
const coordinatesOf = (url: string): { from: [number, number]; to: [number, number] } => {
  const match = /driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)\?/.exec(url);
  if (!match) throw new Error(`URL inatteso: ${url}`);
  return { from: [Number(match[1]), Number(match[2])], to: [Number(match[3]), Number(match[4])] };
};

let a = "";
let b = "";
let c = "";
let broken = "";
let other = "";
const itinerarySlugs = [slug("viaggio"), slug("guasto")];

// Un fetch simulato: linea retta, distanza 1000 m, 120 s. Il luogo "broken" risponde 500.
function fakeRouter(brokenLng: number, brokenLat: number) {
  return vi.fn(async (input: string | URL | Request) => {
    const { from, to } = coordinatesOf(String(input));
    const touchesBroken = (from[0] === brokenLng && from[1] === brokenLat) || (to[0] === brokenLng && to[1] === brokenLat);
    if (touchesBroken) return new Response("internal", { status: 500 });
    return Response.json({
      code: "Ok",
      routes: [{ distance: 1000, duration: 120, geometry: { coordinates: [from, to] } }],
    });
  });
}

beforeAll(async () => {
  const rows = await dbAdmin
    .insert(places)
    .values([
      { slug: slug("a"), name: "int A", ...place(13.3, 38.1) },
      { slug: slug("b"), name: "int B", ...place(13.4, 38.2) },
      { slug: slug("c"), name: "int C", ...place(13.35, 38.15) },
      { slug: slug("broken"), name: "int guasto", ...place(13.5, 38.25) },
      { slug: slug("other"), name: "int D", ...place(13.6, 38.3) },
    ])
    .returning({ id: places.id, slug: places.slug });
  const id = (name: string) => rows.find((row) => row.slug === slug(name))!.id;
  a = id("a");
  b = id("b");
  c = id("c");
  broken = id("broken");
  other = id("other");

  // Modello di prova: A, B nel primo giorno; C nel secondo. Una tappa senza luogo in mezzo.
  const [trip] = await dbAdmin
    .insert(itineraries)
    .values({ title: slug("viaggio"), slug: slug("viaggio"), days: 2, isTemplate: true, ownerId: null })
    .returning({ id: itineraries.id });
  await dbAdmin.insert(itineraryItems).values([
    { itineraryId: trip!.id, dayIndex: 0, position: 0, placeId: a },
    { itineraryId: trip!.id, dayIndex: 0, position: 1, placeId: b },
    { itineraryId: trip!.id, dayIndex: 0, position: 2, customTitle: "Pausa" },
    { itineraryId: trip!.id, dayIndex: 1, position: 0, placeId: c },
  ]);

  // Secondo itinerario: una tratta verso il luogo guasto, che il router non riesce a calcolare.
  const [guasto] = await dbAdmin
    .insert(itineraries)
    .values({ title: slug("guasto"), slug: slug("guasto"), days: 1, isTemplate: true, ownerId: null })
    .returning({ id: itineraries.id });
  await dbAdmin.insert(itineraryItems).values([
    { itineraryId: guasto!.id, dayIndex: 0, position: 0, placeId: other },
    { itineraryId: guasto!.id, dayIndex: 0, position: 1, placeId: broken },
  ]);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await dbAdmin.delete(itineraries).where(inArray(itineraries.slug, itinerarySlugs));
  await dbAdmin.delete(placeLegs).where(gte(placeLegs.computedAt, startedAt));
  await dbAdmin.delete(places).where(sql`${places.slug} like ${`int-leg-${s}-%`}`);
});

describe("tratte stradali su Postgres locale", () => {
  it("calcola le coppie consecutive dei luoghi diversi, anche a cavallo dei giorni", async () => {
    vi.stubGlobal("fetch", fakeRouter(13.5, 38.25));

    await computeMissingLegs(1000, { pauseMs: 0 });
    const legs = await getLegs([
      { from: a, to: b },
      { from: b, to: c },
      { from: a, to: c },
    ]);

    expect(legs.map((leg) => [leg.fromPlaceId, leg.toPlaceId])).toEqual([
      [a, b],
      [b, c],
    ]);
    expect(legs[0]).toMatchObject({ distanceM: 1000, durationS: 120 });
    expect(legs[0]!.coordinates).toHaveLength(2);
  });

  it("è idempotente: una coppia salvata non si richiede di nuovo e non si duplica", async () => {
    const fetchMock = fakeRouter(13.5, 38.25);
    vi.stubGlobal("fetch", fetchMock);

    expect(await findMissingPairs(1000)).not.toContainEqual({ from: a, to: b });
    await computeMissingLegs(1000, { pauseMs: 0 });

    const rows = await dbAdmin
      .select({ id: placeLegs.fromPlaceId })
      .from(placeLegs)
      .where(and(eq(placeLegs.fromPlaceId, a), eq(placeLegs.toPlaceId, b)));
    expect(rows).toHaveLength(1);
    const requestedAB = fetchMock.mock.calls.filter((call) => {
      const { from, to } = coordinatesOf(String(call[0]));
      return from[0] === 13.3 && from[1] === 38.1 && to[0] === 13.4 && to[1] === 38.2;
    });
    expect(requestedAB).toHaveLength(0);
  });

  it("conta il fallimento del router e non salva nulla per quella coppia", async () => {
    vi.stubGlobal("fetch", fakeRouter(13.5, 38.25));

    const result = await computeMissingLegs(1000, { pauseMs: 0 });

    expect(result.failed).toBeGreaterThanOrEqual(1);
    const legs = await getLegs([{ from: other, to: broken }]);
    expect(legs).toEqual([]);
  });

  it("con una coppia che manca dalla tabella getLegs la omette senza errori", async () => {
    const legs = await getLegs([
      { from: a, to: broken },
      { from: "not-a-uuid", to: b },
      { from: a, to: a },
    ]);
    expect(legs).toEqual([]);
  });
});
