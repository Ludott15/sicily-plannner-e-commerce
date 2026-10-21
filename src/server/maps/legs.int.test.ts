import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { itineraries, itineraryItems, placeLegFailures, placeLegs, places } from "@/server/db/schema";
import { getLegs } from "./legs";
import { computeMissingLegs, findMissingPairs } from "./legs.admin";

// Tratte stradali su Postgres locale (npm run test:int). Il database locale ha dati veri: per non
// dipendere da loro, ogni calcolo e ogni ricerca di coppie è limitato ai luoghi di prova (onlyPlaceIds),
// con pausa 0 e un fetch simulato immediato: una linea retta tra i due punti, 500 se tocca il luogo
// "broken". Luoghi e itinerari sono di prova (int-…) e si cancellano alla fine; le tratte calcolate
// durante la suite si tolgono con il loro computed_at.

const TEST_TIMEOUT_MS = 15_000;
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
let far = "";
let farAway = "";
let scope: string[] = [];
let userId = "";
const templateSlug = slug("modello");
const tripSlug = slug("viaggio-utente");

// Un fetch simulato, senza attese: linea retta, distanza 1000 m, 120 s. Le richieste che toccano il
// luogo "broken" rispondono 500.
function fakeRouter(brokenLng: number, brokenLat: number) {
  return vi.fn(async (input: string | URL | Request) => {
    const { from, to } = coordinatesOf(String(input));
    const touchesBroken =
      (from[0] === brokenLng && from[1] === brokenLat) || (to[0] === brokenLng && to[1] === brokenLat);
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
      // Palermo e Siracusa: oltre 150 km in linea d'aria, quindi mai nel catalogo.
      { slug: slug("far"), name: "int Palermo", ...place(13.36, 38.12) },
      { slug: slug("farAway"), name: "int Siracusa", ...place(15.29, 37.07) },
    ])
    .returning({ id: places.id, slug: places.slug });
  const id = (name: string) => rows.find((row) => row.slug === slug(name))!.id;
  a = id("a");
  b = id("b");
  c = id("c");
  broken = id("broken");
  other = id("other");
  far = id("far");
  farAway = id("farAway");
  scope = rows.map((row) => row.id);

  // Modello di prova: A, B nel primo giorno; C nel secondo. Una tappa senza luogo in mezzo.
  const [template] = await dbAdmin
    .insert(itineraries)
    .values({ title: templateSlug, slug: templateSlug, days: 2, isTemplate: true, ownerId: null })
    .returning({ id: itineraries.id });
  await dbAdmin.insert(itineraryItems).values([
    { itineraryId: template!.id, dayIndex: 0, position: 0, placeId: a },
    { itineraryId: template!.id, dayIndex: 0, position: 1, placeId: b },
    { itineraryId: template!.id, dayIndex: 0, position: 2, customTitle: "Pausa" },
    { itineraryId: template!.id, dayIndex: 1, position: 0, placeId: c },
  ]);

  // Viaggio di un utente: Palermo e Siracusa. Non è un modello, quindi la sua tratta non va calcolata.
  userId = randomUUID();
  await dbAdmin.execute(
    sql`insert into auth.users (id, email, raw_user_meta_data) values (${userId}, ${`int-leg-${s}@example.com`}, '{"full_name": "Tratte int"}')`,
  );
  const [trip] = await dbAdmin
    .insert(itineraries)
    .values({ title: tripSlug, slug: tripSlug, days: 1, isTemplate: false, ownerId: userId })
    .returning({ id: itineraries.id });
  await dbAdmin.insert(itineraryItems).values([
    { itineraryId: trip!.id, dayIndex: 0, position: 0, placeId: far },
    { itineraryId: trip!.id, dayIndex: 0, position: 1, placeId: farAway },
  ]);
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  vi.unstubAllGlobals();
  await dbAdmin.delete(itineraries).where(inArray(itineraries.slug, [templateSlug, tripSlug]));
  await dbAdmin.delete(placeLegs).where(gte(placeLegs.computedAt, startedAt));
  await dbAdmin.delete(placeLegFailures).where(gte(placeLegFailures.failedAt, startedAt));
  await dbAdmin.delete(places).where(sql`${places.slug} like ${`int-leg-${s}-%`}`);
  if (userId) await dbAdmin.execute(sql`delete from auth.users where id = ${userId}`);
}, TEST_TIMEOUT_MS);

describe("tratte stradali su Postgres locale", () => {
  it(
    "calcola le coppie consecutive dei modelli, anche a cavallo dei giorni",
    async () => {
      vi.stubGlobal("fetch", fakeRouter(13.5, 38.25));

      await computeMissingLegs(1000, { pauseMs: 0, onlyPlaceIds: scope });
      const legs = await getLegs([
        { from: a, to: b },
        { from: b, to: c },
      ]);

      expect(legs.map((leg) => [leg.fromPlaceId, leg.toPlaceId])).toEqual([
        [a, b],
        [b, c],
      ]);
      expect(legs[0]).toMatchObject({ distanceM: 1000, durationS: 120 });
      expect(legs[0]!.coordinates).toHaveLength(2);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "include le coppie del catalogo entro 150 km, anche se non sono in un modello",
    async () => {
      const legs = await getLegs([
        { from: a, to: c },
        { from: c, to: a },
      ]);
      expect(legs).toHaveLength(2);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "non calcola le coppie oltre 150 km né i viaggi degli utenti",
    async () => {
      const pairs = await findMissingPairs(1000, { onlyPlaceIds: scope });
      expect(pairs).not.toContainEqual({ from: far, to: farAway });
      expect(pairs).not.toContainEqual({ from: farAway, to: far });
      expect(await getLegs([{ from: far, to: farAway }])).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "è idempotente: una coppia salvata non si richiede di nuovo e non si duplica",
    async () => {
      const fetchMock = fakeRouter(13.5, 38.25);
      vi.stubGlobal("fetch", fetchMock);

      expect(await findMissingPairs(1000, { onlyPlaceIds: scope })).not.toContainEqual({ from: a, to: b });
      await computeMissingLegs(1000, { pauseMs: 0, onlyPlaceIds: scope });

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
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "registra il fallimento, lo salta per sette giorni e lo riprova dopo",
    async () => {
      vi.stubGlobal("fetch", fakeRouter(13.5, 38.25));
      // I fallimenti dei luoghi di prova registrati dalle prove precedenti si azzerano: qui si parte da zero.
      await dbAdmin
        .delete(placeLegFailures)
        .where(sql`${placeLegFailures.fromPlaceId} in (${sql.join(scope.map((id) => sql`${id}::uuid`), sql`, `)})`);

      const result = await computeMissingLegs(1000, { pauseMs: 0, onlyPlaceIds: scope });
      expect(result.failed).toBeGreaterThanOrEqual(1);
      expect(await getLegs([{ from: other, to: broken }])).toEqual([]);

      const failure = await dbAdmin
        .select({ failedAt: placeLegFailures.failedAt })
        .from(placeLegFailures)
        .where(and(eq(placeLegFailures.fromPlaceId, other), eq(placeLegFailures.toPlaceId, broken)));
      expect(failure).toHaveLength(1);

      // Entro sette giorni la coppia non si richiede di nuovo.
      expect(await findMissingPairs(1000, { onlyPlaceIds: scope })).not.toContainEqual({ from: other, to: broken });

      // Dopo sette giorni torna nella lista delle coppie da calcolare.
      await dbAdmin
        .update(placeLegFailures)
        .set({ failedAt: sql`now() - interval '8 days'` })
        .where(and(eq(placeLegFailures.fromPlaceId, other), eq(placeLegFailures.toPlaceId, broken)));
      expect(await findMissingPairs(1000, { onlyPlaceIds: scope })).toContainEqual({ from: other, to: broken });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "con una coppia che manca dalla tabella getLegs la omette senza errori",
    async () => {
      const legs = await getLegs([
        { from: a, to: broken },
        { from: "not-a-uuid", to: b },
        { from: a, to: a },
      ]);
      expect(legs).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );
});
