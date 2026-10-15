import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { orderPair } from "@/lib/drive-pairs";
import { dbAdmin } from "@/server/db/admin";
import { adminAuditLog, areaDriveTimes, areas } from "@/server/db/schema";
import { listDriveTimes, saveDriveTimes, type DriveTimePair } from "./drive-times.admin";

// Tempi di guida tra aree su Postgres locale (npm run test:int). L'admin è fissato dal mock di
// requireAdmin (la sessione legge i cookie); le azioni si chiamano come le chiama il form, con
// FormData. Aree di prova int-: si cancellano alla fine (la matrice va via per cascade).

const admin = vi.hoisted(() => ({ id: "" }));
vi.mock("@/server/auth", () => ({ requireAdmin: async () => ({ user: { id: admin.id } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const s = Date.now();
const actorEmail = `int-tempi-${s}@example.com`;
let areaIds: string[] = [];
const id = (i: number) => areaIds[i]!;

const form = (pairs: unknown) => {
  const data = new FormData();
  data.set("locale", "it");
  data.set("pairs", JSON.stringify(pairs));
  return data;
};
const save = (pairs: unknown) => saveDriveTimes({ status: "idle" }, form(pairs));

// Riga della coppia nella tabella (ordinata come in scrittura), o nessuna.
const stored = (x: string, y: string) => {
  const [a, b] = orderPair(x, y);
  return dbAdmin
    .select({ minutes: areaDriveTimes.minutes })
    .from(areaDriveTimes)
    .where(and(eq(areaDriveTimes.areaAId, a), eq(areaDriveTimes.areaBId, b)));
};

// Solo le coppie delle aree di prova: la matrice reale può avere altre righe.
const ours = (rows: DriveTimePair[]) => rows.filter((r) => areaIds.includes(r.a) && areaIds.includes(r.b));

beforeAll(async () => {
  admin.id = randomUUID();
  await dbAdmin.execute(
    sql`insert into auth.users (id, email, raw_user_meta_data) values (${admin.id}, ${actorEmail}, '{"full_name": "Tempi int"}')`,
  );
  const rows = await dbAdmin
    .insert(areas)
    .values(
      ["a", "b", "c"].map((letter, i) => ({
        slug: `int-dt-${letter}-${s}`,
        nameIt: `int- Area ${letter}`,
        nameEn: `int- Area ${letter}`,
        sort: 900 + i,
      })),
    )
    .returning({ id: areas.id });
  areaIds = rows.map((row) => row.id);
});

afterAll(async () => {
  if (areaIds.length > 0) await dbAdmin.delete(areas).where(inArray(areas.id, areaIds));
  await dbAdmin.execute(sql`delete from auth.users where id = ${admin.id}`);
});

describe("tempi di guida: salvataggio dell'admin", () => {
  it("salva una coppia, riordinata come in tabella", async () => {
    expect(await save([{ a: id(1), b: id(0), minutes: 90 }])).toEqual({ status: "saved" });
    expect(await stored(id(0), id(1))).toEqual([{ minutes: 90 }]);
  });

  it("aggiorna la stessa coppia senza duplicarla", async () => {
    expect(await save([{ a: id(0), b: id(1), minutes: 120 }])).toEqual({ status: "saved" });
    expect(await stored(id(0), id(1))).toEqual([{ minutes: 120 }]);
  });

  it("minuti vuoti cancellano la coppia", async () => {
    expect(await save([{ a: id(0), b: id(1), minutes: null }])).toEqual({ status: "saved" });
    expect(await stored(id(0), id(1))).toEqual([]);
  });

  it("ogni salvataggio scrive una riga di audit con prima e dopo", async () => {
    const audit = await dbAdmin
      .select({ action: adminAuditLog.action, diff: adminAuditLog.diff })
      .from(adminAuditLog)
      .where(eq(adminAuditLog.actorId, admin.id))
      .orderBy(asc(adminAuditLog.id));
    expect(audit.map((row) => row.action)).toEqual(["drive_times.update", "drive_times.update", "drive_times.update"]);
    const [, second] = audit;
    const diff = second!.diff as { before: DriveTimePair[]; after: DriveTimePair[] };
    const [lo, hi] = orderPair(id(0), id(1));
    expect(ours(diff.before)).toEqual([{ a: lo, b: hi, minutes: 90 }]);
    expect(ours(diff.after)).toEqual([{ a: lo, b: hi, minutes: 120 }]);
  });

  it("dati non validi: nessuna modifica e nessuna riga di audit", async () => {
    const invalid = [
      [{ a: id(0), b: id(0), minutes: 10 }],
      [{ a: randomUUID(), b: id(0), minutes: 10 }],
      [{ a: id(0), b: id(1), minutes: 10 }, { a: id(1), b: id(0), minutes: 20 }],
      [{ a: id(0), b: id(1), minutes: 0 }],
      [{ a: id(0), b: id(1), minutes: 601 }],
      Array.from({ length: 29 }, () => ({ a: id(0), b: randomUUID(), minutes: 10 })),
    ];
    for (const pairs of invalid) {
      expect(await save(pairs)).toEqual({ status: "error", code: "invalid" });
    }
    expect(await stored(id(0), id(1))).toEqual([]);
    const count = await dbAdmin
      .select({ id: adminAuditLog.id })
      .from(adminAuditLog)
      .where(eq(adminAuditLog.actorId, admin.id));
    expect(count).toHaveLength(3);
  });

  it("la lista mostra le aree e le coppie salvate", async () => {
    await save([{ a: id(2), b: id(0), minutes: 45 }]);
    const listed = await listDriveTimes();
    expect(listed.areas.map((row) => row.id)).toEqual(expect.arrayContaining(areaIds));
    const [lo, hi] = orderPair(id(0), id(2));
    expect(ours(listed.pairs)).toEqual([{ a: lo, b: hi, minutes: 45 }]);
    await save([{ a: id(2), b: id(0), minutes: null }]);
  });
});
