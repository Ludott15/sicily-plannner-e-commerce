import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { areas, itineraries, itineraryItems, itineraryNights, itineraryShareLinks } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";
import { dbAsUser, type DbUser } from "@/server/db/user";
import {
  addDayTx,
  createShareLinkTx,
  duplicateTripTx,
  moveStopTx,
  removeDayTx,
  reorderTripTx,
  revokeShareLinkTx,
  saveDayNoteTx,
} from "./builder";

// Scritture del builder con dbAsUser, sul database locale. Utenti e dati creati qui hanno il
// prefisso int- (lo elimina npm run db:clean); nulla dipende dai dati del seed.

const stamp = Date.now();
const alice: DbUser = { id: randomUUID(), email: `int-builder-alice-${stamp}@example.com` };
const bob: DbUser = { id: randomUUID(), email: `int-builder-bob-${stamp}@example.com` };
const areaSlug = `int-builder-${randomUUID().slice(0, 8)}`;
let areaId = "";

beforeAll(async () => {
  // Il trigger on_auth_user_created crea i profili.
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, raw_user_meta_data)
    values (${alice.id}, ${alice.email}, '{"full_name": "Alice"}'),
           (${bob.id}, ${bob.email}, '{"full_name": "Bob"}')`);
  const [area] = await dbAdmin
    .insert(areas)
    .values({ slug: areaSlug, nameIt: "Area di test", nameEn: "Test area" })
    .returning({ id: areas.id });
  areaId = area!.id;
});

afterAll(async () => {
  await dbAdmin.execute(sql`delete from auth.users where id in (${alice.id}, ${bob.id})`);
  await dbAdmin.delete(areas).where(eq(areas.id, areaId));
});

type StopSeed = { dayIndex: number; position: number; title: string; timeSlot?: "morning" | "lunch" | "afternoon" | "evening" };

type TripSeed = {
  title: string;
  days: number;
  dayTitles?: string[];
  dayNotes?: string[];
  pace?: "relaxed" | "balanced" | "intense" | null;
  travelers?: number | null;
  startDate?: string | null;
};

// Preparazione dei dati con dbAdmin: le azioni sotto test girano poi con dbAsUser.
async function createTrip(user: DbUser, values: TripSeed, stops: StopSeed[] = [], nights: number[] = []): Promise<string> {
  return dbAdmin.transaction(async (tx) => {
    const [row] = await tx
      .insert(itineraries)
      .values({
        ownerId: user.id,
        title: values.title,
        days: values.days,
        dayTitles: values.dayTitles ?? [],
        dayNotes: values.dayNotes ?? [],
        pace: values.pace ?? null,
        travelers: values.travelers ?? null,
        startDate: values.startDate ?? null,
      })
      .returning({ id: itineraries.id });
    const id = row!.id;
    if (stops.length > 0) {
      await tx.insert(itineraryItems).values(
        stops.map((s) => ({
          itineraryId: id,
          dayIndex: s.dayIndex,
          position: s.position,
          customTitle: s.title,
          timeSlot: s.timeSlot ?? null,
        })),
      );
    }
    if (nights.length > 0) {
      await tx.insert(itineraryNights).values(nights.map((n) => ({ itineraryId: id, nightIndex: n, areaId })));
    }
    return id;
  });
}

async function readTrip(user: DbUser, tripId: string) {
  return dbAsUser(user, async (tx) => {
    const [trip] = await tx.select().from(itineraries).where(eq(itineraries.id, tripId));
    const stops = await tx
      .select({
        id: itineraryItems.id,
        dayIndex: itineraryItems.dayIndex,
        position: itineraryItems.position,
        title: itineraryItems.customTitle,
        timeSlot: itineraryItems.timeSlot,
      })
      .from(itineraryItems)
      .where(eq(itineraryItems.itineraryId, tripId))
      .orderBy(asc(itineraryItems.dayIndex), asc(itineraryItems.position));
    const nights = await tx
      .select({ nightIndex: itineraryNights.nightIndex, areaId: itineraryNights.areaId })
      .from(itineraryNights)
      .where(eq(itineraryNights.itineraryId, tripId))
      .orderBy(asc(itineraryNights.nightIndex));
    return { trip: trip!, stops, nights };
  });
}

// Il jsonb del link pubblico, come lo legge il sito (ruolo anonimo).
async function sharedTrip(token: string): Promise<Record<string, unknown> | null> {
  const rows = await dbPublic((tx) =>
    tx.execute<{ trip: Record<string, unknown> | null }>(sql`select public.shared_itinerary(${token}) as trip`),
  );
  return rows[0]?.trip ?? null;
}

describe("rimozione di un giorno", () => {
  it("toglie le tappe del giorno, scala le successive, accorcia titoli e note e rinumera le notti", async () => {
    const tripId = await createTrip(
      alice,
      { title: "Tre giorni", days: 3, dayTitles: ["Uno", "Due", "Tre"], dayNotes: ["n1", "n2", "n3"] },
      [
        { dayIndex: 0, position: 0, title: "a0" },
        { dayIndex: 1, position: 0, title: "b0" },
        { dayIndex: 1, position: 1, title: "b1" },
        { dayIndex: 2, position: 0, title: "c0", timeSlot: "evening" },
      ],
      [1, 2],
    );

    expect(await dbAsUser(alice, (tx) => removeDayTx(tx, tripId, 1))).toEqual({ ok: true, value: undefined });

    const after = await readTrip(alice, tripId);
    expect(after.trip.days).toBe(2);
    expect(after.trip.dayTitles).toEqual(["Uno", "Tre"]);
    expect(after.trip.dayNotes).toEqual(["n1", "n3"]);
    expect(after.stops.map((s) => [s.dayIndex, s.title, s.timeSlot])).toEqual([
      [0, "a0", null],
      [1, "c0", "evening"],
    ]);
    // Notti: esce la 2 (tra il giorno tolto e il successivo), la 1 resta con area invariata.
    expect(after.nights.map((n) => n.nightIndex)).toEqual([1]);
    expect(after.nights[0]?.areaId).toBe(areaId);
  });

  it("togliendo l'ultimo giorno esce anche l'ultima notte", async () => {
    const tripId = await createTrip(alice, { title: "Due giorni notte", days: 2 }, [{ dayIndex: 0, position: 0, title: "x" }], [1]);
    expect(await dbAsUser(alice, (tx) => removeDayTx(tx, tripId, 1))).toEqual({ ok: true, value: undefined });
    const after = await readTrip(alice, tripId);
    expect(after.trip.days).toBe(1);
    expect(after.nights).toEqual([]);
  });

  it("l'unico giorno non si toglie e chi non vede il viaggio riceve not_found", async () => {
    const single = await createTrip(alice, { title: "Un giorno", days: 1 });
    expect(await dbAsUser(alice, (tx) => removeDayTx(tx, single, 0))).toEqual({ ok: false, code: "last_day" });

    const tripId = await createTrip(alice, { title: "Di Alice", days: 2 });
    expect(await dbAsUser(bob, (tx) => removeDayTx(tx, tripId, 0))).toEqual({ ok: false, code: "not_found" });
    expect((await readTrip(alice, tripId)).trip.days).toBe(2);
  });
});

describe("aggiunta di un giorno", () => {
  it("aggiunge in fondo, fino a 60 giorni", async () => {
    const tripId = await createTrip(alice, { title: "Aggiungi", days: 2 });
    expect(await dbAsUser(alice, (tx) => addDayTx(tx, tripId))).toEqual({ ok: true, value: undefined });
    expect((await readTrip(alice, tripId)).trip.days).toBe(3);

    const full = await createTrip(alice, { title: "Pieno", days: 60 });
    expect(await dbAsUser(alice, (tx) => addDayTx(tx, full))).toEqual({ ok: false, code: "day_limit" });
  });
});

describe("tappe", () => {
  it("sposta una tappa in un altro giorno e riordina entrambi", async () => {
    const tripId = await createTrip(alice, { title: "Spostamenti", days: 2 }, [
      { dayIndex: 0, position: 0, title: "x" },
      { dayIndex: 0, position: 1, title: "y" },
      { dayIndex: 1, position: 0, title: "z" },
    ]);
    const before = await readTrip(alice, tripId);
    const yId = before.stops.find((s) => s.title === "y")!.id;
    expect(await dbAsUser(alice, (tx) => moveStopTx(tx, yId, 1, 0))).toEqual({ ok: true, value: undefined });

    const after = await readTrip(alice, tripId);
    expect(after.stops.map((s) => [s.dayIndex, s.position, s.title])).toEqual([
      [0, 0, "x"],
      [1, 0, "y"],
      [1, 1, "z"],
    ]);
  });

  it("il riordino vuole tutte le tappe, una volta sola, su giorni validi", async () => {
    const tripId = await createTrip(alice, { title: "Riordino", days: 2 }, [
      { dayIndex: 0, position: 0, title: "p" },
      { dayIndex: 1, position: 0, title: "q" },
    ]);
    const { stops } = await readTrip(alice, tripId);
    const idOf = (title: string) => stops.find((s) => s.title === title)!.id;

    // Manca una tappa.
    expect(await dbAsUser(alice, (tx) => reorderTripTx(tx, tripId, [{ id: idOf("p"), dayIndex: 0, position: 0 }]))).toEqual({
      ok: false,
      code: "invalid",
    });
    // Stessa coppia giorno/posizione per due tappe.
    expect(
      await dbAsUser(alice, (tx) =>
        reorderTripTx(tx, tripId, [
          { id: idOf("p"), dayIndex: 1, position: 0 },
          { id: idOf("q"), dayIndex: 1, position: 0 },
        ]),
      ),
    ).toEqual({ ok: false, code: "invalid" });
    // Valido: "q" passa al primo giorno, "p" al secondo.
    expect(
      await dbAsUser(alice, (tx) =>
        reorderTripTx(tx, tripId, [
          { id: idOf("p"), dayIndex: 1, position: 1 },
          { id: idOf("q"), dayIndex: 0, position: 0 },
        ]),
      ),
    ).toEqual({ ok: true, value: undefined });
    const after = await readTrip(alice, tripId);
    expect(after.stops.map((s) => [s.dayIndex, s.title])).toEqual([
      [0, "q"],
      [1, "p"],
    ]);
  });
});

describe("note", () => {
  it("la nota del giorno riempie i giorni precedenti con vuoti e rifiuta un giorno fuori dal viaggio", async () => {
    const tripId = await createTrip(alice, { title: "Note", days: 3 });
    expect(await dbAsUser(alice, (tx) => saveDayNoteTx(tx, tripId, 2, "ultima"))).toEqual({ ok: true, value: undefined });
    expect((await readTrip(alice, tripId)).trip.dayNotes).toEqual(["", "", "ultima"]);
    expect(await dbAsUser(alice, (tx) => saveDayNoteTx(tx, tripId, 3, "fuori"))).toEqual({ ok: false, code: "invalid" });
  });
});

describe("duplica", () => {
  it("copia itinerario, tappe e notti, con owner l'utente e senza gruppo", async () => {
    const sourceId = await createTrip(
      alice,
      { title: "Viaggio lungo", days: 2, dayTitles: ["Primo"], dayNotes: ["nota"], pace: "intense", travelers: 2, startDate: "2026-07-10" },
      [
        { dayIndex: 0, position: 0, title: "uno", timeSlot: "morning" },
        { dayIndex: 1, position: 0, title: "due" },
      ],
      [1],
    );
    const copyId = await dbAsUser(alice, (tx) => duplicateTripTx(tx, alice, sourceId, "Copia di "));
    expect(copyId).not.toBeNull();
    expect(copyId).not.toBe(sourceId);

    const copy = await readTrip(alice, copyId!);
    expect(copy.trip).toMatchObject({
      title: "Copia di Viaggio lungo",
      days: 2,
      travelers: 2,
      pace: "intense",
      startDate: "2026-07-10",
      dayTitles: ["Primo"],
      dayNotes: ["nota"],
      groupId: null,
      templateId: null,
      ownerId: alice.id,
    });
    expect(copy.stops.map((s) => [s.dayIndex, s.title, s.timeSlot])).toEqual([
      [0, "uno", "morning"],
      [1, "due", null],
    ]);
    expect(copy.nights.map((n) => n.nightIndex)).toEqual([1]);
  });

  it("il titolo della copia non supera 200 caratteri", async () => {
    const sourceId = await createTrip(alice, { title: "x".repeat(200), days: 1 });
    const copyId = await dbAsUser(alice, (tx) => duplicateTripTx(tx, alice, sourceId, "Copia di "));
    const copy = await readTrip(alice, copyId!);
    expect(copy.trip.title).toHaveLength(200);
    expect(copy.trip.title.startsWith("Copia di x")).toBe(true);
  });

  it("chi non vede il viaggio non lo copia", async () => {
    const sourceId = await createTrip(alice, { title: "Privato", days: 1 });
    expect(await dbAsUser(bob, (tx) => duplicateTripTx(tx, bob, sourceId, "Copia di "))).toBeNull();
  });
});

describe("link pubblico", () => {
  it("il token valido legge il viaggio senza dati del proprietario; Rigenera e revoca lo chiudono", async () => {
    const tripId = await createTrip(alice, { title: "Condiviso", days: 1 }, [{ dayIndex: 0, position: 0, title: "tappa" }]);

    const first = await dbAsUser(alice, (tx) => createShareLinkTx(tx, alice, tripId));
    expect(first.ok).toBe(true);
    const token1 = first.ok ? first.value : "";
    expect(token1).toHaveLength(43);

    const shared = await sharedTrip(token1);
    expect(shared).toMatchObject({ title: "Condiviso", days: 1 });
    expect(JSON.stringify(shared)).not.toContain(alice.id);
    expect(JSON.stringify(shared)).not.toContain(alice.email!);

    // Rigenera: il nuovo token funziona, il precedente non più.
    const second = await dbAsUser(alice, (tx) => createShareLinkTx(tx, alice, tripId));
    const token2 = second.ok ? second.value : "";
    expect(token2).not.toBe(token1);
    expect(await sharedTrip(token1)).toBeNull();
    expect(await sharedTrip(token2)).not.toBeNull();

    const active = await dbAdmin
      .select({ id: itineraryShareLinks.id })
      .from(itineraryShareLinks)
      .where(and(eq(itineraryShareLinks.itineraryId, tripId), sql`${itineraryShareLinks.revokedAt} is null`));
    expect(active).toHaveLength(1);

    expect(await dbAsUser(alice, (tx) => revokeShareLinkTx(tx, tripId))).toEqual({ ok: true, value: undefined });
    expect(await sharedTrip(token2)).toBeNull();
  });

  it("chi non vede il viaggio non crea né revoca link su di esso", async () => {
    const tripId = await createTrip(alice, { title: "Non di Bob", days: 1 });
    expect(await dbAsUser(bob, (tx) => createShareLinkTx(tx, bob, tripId))).toEqual({ ok: false, code: "not_found" });
    expect(await dbAsUser(bob, (tx) => revokeShareLinkTx(tx, tripId))).toEqual({ ok: false, code: "not_found" });
  });

  it("un token sconosciuto non restituisce nulla", async () => {
    expect(await sharedTrip("a".repeat(43))).toBeNull();
  });
});
