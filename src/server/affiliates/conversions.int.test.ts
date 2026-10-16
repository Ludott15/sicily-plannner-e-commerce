import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CONVERSION_COLUMNS, CONVERSION_PARTNERS, type ConversionImportOutcome, type ConversionRow } from "@/lib/affiliate-conversions/types";
import { resolvePeriod, type ConversionPeriod } from "@/lib/affiliate-conversions/period";
import { dbAdmin } from "@/server/db/admin";
import { partner as partnerEnum } from "@/server/db/schema/enums";
import { adminAuditLog, affiliateClicks, affiliateConversions } from "@/server/db/schema";
import { loadConversionDashboard, loadConversionExportRows } from "./conversions-dashboard.admin";
import { applyConversionRows, buildConversionImportPreview, commitConversionImport } from "./conversions-import.admin";

// Il test usa solo le funzioni load*/apply* (ricevono il database); requireAdmin delle funzioni
// esportate porterebbe con sé la navigazione di next-intl, che Vitest non risolve.
vi.mock("@/server/auth", () => ({ requireAdmin: async () => undefined }));

// Conversioni affiliate su Postgres locale (npm run test:int): import idempotente, anteprima e
// conferma dal CSV, attribuzione al click tramite subid, conversioni senza click, dashboard e
// esportazione. Tutto ha il prefisso int- o il subid int + 12 caratteri esadecimali. Le funzioni
// requireAdmin non si chiamano qui (leggono i cookie): si chiamano le funzioni load* e i moduli
// import come farebbero le azioni dopo requireAdmin.

const s = Date.now();
const actor = { id: randomUUID(), email: `int-conv-${s}@example.com` };
const placeId = randomUUID();
const placeSlug = `int-conv-luogo-${s}`;
const activityId = randomUUID();
const activitySlug = `int-conv-att-${s}`;
const activityTitle = `int- Attività conversioni ${s}`;
const linkedSubid = `int${randomBytes(6).toString("hex")}`;
const unlinkedSubid = `int${randomBytes(6).toString("hex")}`;
const linkedExternalId = `int-ext-${s}-a`;
const unlinkedExternalId = `int-ext-${s}-b`;
const csvLinkedExternalId = `int-csv-${s}-c`;
const csvUnlinkedSubid = `int${randomBytes(6).toString("hex")}`;
const outsideSubid = `int${randomBytes(6).toString("hex")}`;
const outsideExternalId = `int-ext-${s}-d`;

// Periodo di prova: le conversioni e i click del test cadono qui, non "oggi".
const PERIOD: ConversionPeriod = resolvePeriod({ da: "2026-10-01", a: "2026-10-31" }, new Date());

const linkedRow = (status: ConversionRow["status"]): ConversionRow => ({
  partner: "getyourguide",
  subid: linkedSubid,
  externalId: linkedExternalId,
  amountEur: "120.00",
  commissionEur: "9.60",
  status,
  reportedAt: "2026-10-10",
});

const unlinkedRow = (): ConversionRow => ({
  partner: "viator",
  subid: unlinkedSubid,
  externalId: unlinkedExternalId,
  amountEur: "45.00",
  commissionEur: "4.05",
  status: "approved",
  reportedAt: "2026-10-11",
});

// CSV con il separatore ","; i decimali col punto. Riga 1: stessa conversione collegata già importata
// dal test API (aggiornata, stato approvata), riga 2 nuova senza click, riga 3 con importo non valido.
function csvOf(): string {
  const header = CONVERSION_COLUMNS.join(",");
  const rows = [
    ["getyourguide", linkedSubid, linkedExternalId, "120.00", "9.60", "approvata", "2026-10-10"],
    ["viator", csvUnlinkedSubid, csvLinkedExternalId, "30.00", "2.70", "in attesa", "2026-10-12"],
    ["civitatis", csvUnlinkedSubid, "", "abc", "1.00", "pagata", "2026-10-12"],
  ];
  return [header, ...rows.map((row) => row.join(","))].join("\r\n") + "\r\n";
}

const preview = (text: string) => dbAdmin.transaction((tx) => buildConversionImportPreview(tx, "int.csv", text));
const commit = (text: string) => dbAdmin.transaction((tx) => commitConversionImport(tx, actor.id, "int.csv", text));

function expectPreview(outcome: ConversionImportOutcome) {
  if (outcome.status !== "preview") throw new Error(`atteso preview, ottenuto ${outcome.status}`);
  return outcome.preview;
}

function expectImported(outcome: ConversionImportOutcome) {
  if (outcome.status !== "imported") throw new Error(`attesa importazione, ottenuto ${outcome.status}`);
  return outcome.result;
}

beforeAll(async () => {
  await dbAdmin.execute(sql`
    insert into auth.users (id, email, raw_user_meta_data)
    values (${actor.id}, ${actor.email}, '{"full_name": "Conversioni int"}')
  `);
  await dbAdmin.execute(sql`
    insert into public.places (id, slug, name, province, lat, lng)
    values (${placeId}, ${placeSlug}, 'int- Luogo conversioni', 'SR', 37.07, 15.29)
  `);
  await dbAdmin.execute(sql`
    insert into public.activities (id, slug, place_id, title, duration_min, is_active)
    values (${activityId}, ${activitySlug}, ${placeId}, ${activityTitle}, 90, false)
  `);
  await dbAdmin.insert(affiliateClicks).values({
    partner: "getyourguide",
    targetUrl: "https://www.getyourguide.com/int",
    subid: linkedSubid,
    context: "itinerary",
    activityId,
    createdAt: new Date("2026-10-09T10:00:00Z"),
  });
  // Click di settembre (fuori dal periodo) con conversione in ottobre: conta nel contesto del click.
  await dbAdmin.insert(affiliateClicks).values({
    partner: "getyourguide",
    targetUrl: "https://www.getyourguide.com/int",
    subid: outsideSubid,
    context: "flights",
    createdAt: new Date("2026-09-20T10:00:00Z"),
  });
  await dbAdmin.insert(affiliateConversions).values({
    partner: "getyourguide",
    subid: outsideSubid,
    externalId: outsideExternalId,
    amountEur: "60.00",
    commissionEur: "5.40",
    status: "approved",
    reportedAt: new Date("2026-10-12T10:00:00Z"),
    source: "api",
  });
});

afterAll(async () => {
  const subids = [linkedSubid, unlinkedSubid, csvUnlinkedSubid, outsideSubid];
  await dbAdmin.delete(affiliateConversions).where(inArray(affiliateConversions.subid, subids));
  await dbAdmin.delete(affiliateClicks).where(inArray(affiliateClicks.subid, subids));
  await dbAdmin.execute(sql`delete from public.activities where id = ${activityId}`);
  await dbAdmin.execute(sql`delete from public.places where id = ${placeId}`);
  await dbAdmin.execute(sql`delete from auth.users where id = ${actor.id}`);
});

describe("enum dei partner", () => {
  it("CONVERSION_PARTNERS è l'enum partner senza internal", () => {
    expect([...CONVERSION_PARTNERS]).toEqual(partnerEnum.enumValues.filter((value) => value !== "internal"));
  });
});

describe("import via API (applyConversionRows)", () => {
  it("il primo import crea, il secondo aggiorna le stesse righe", async () => {
    const first = await dbAdmin.transaction((tx) =>
      applyConversionRows(tx, [linkedRow("pending"), unlinkedRow()], "api"),
    );
    expect(first).toEqual({ created: 2, updated: 0, skipped: 0 });

    const second = await dbAdmin.transaction((tx) =>
      applyConversionRows(tx, [linkedRow("approved"), unlinkedRow()], "api"),
    );
    expect(second).toEqual({ created: 0, updated: 2, skipped: 0 });

    const stored = await dbAdmin
      .select({ status: affiliateConversions.status, source: affiliateConversions.source })
      .from(affiliateConversions)
      .where(eq(affiliateConversions.externalId, linkedExternalId));
    expect(stored).toEqual([{ status: "approved", source: "api" }]);
  });

  it("due righe con la stessa coppia nel lotto: vale la prima, la seconda è scartata", async () => {
    const result = await dbAdmin.transaction((tx) =>
      applyConversionRows(tx, [linkedRow("pending"), linkedRow("approved")], "api"),
    );
    expect(result.skipped).toBe(1);
  });
});

describe("import dal CSV (anteprima e conferma)", () => {
  it("l'anteprima conta nuove, errori e righe senza click, senza scrivere", async () => {
    const outcome = await preview(csvOf());
    const view = expectPreview(outcome);
    expect(view.totals).toEqual({ create: 1, update: 1, error: 1, withoutClick: 1, possibleDuplicate: 0 });
    expect(view.truncated).toBe(false);
    const bad = view.rows.find((row) => row.status === "error");
    expect(bad?.errors.map((e) => e.code)).toEqual(["amount_invalid"]);
  });

  it("la conferma scrive, registra nel log e l'import ripetuto aggiorna", async () => {
    const first = expectImported(await commit(csvOf()));
    expect(first).toEqual({ created: 1, updated: 1, skipped: 1, withoutClick: 1 });

    const second = expectImported(await commit(csvOf()));
    expect(second).toEqual({ created: 0, updated: 2, skipped: 1, withoutClick: 1 });

    const log = await dbAdmin
      .select({ diff: adminAuditLog.diff })
      .from(adminAuditLog)
      .where(eq(adminAuditLog.actorId, actor.id));
    expect(log.length).toBeGreaterThanOrEqual(2);
  });
});

describe("dashboard ed esportazione", () => {
  it("attribuisce la conversione al click e mostra le senza click a parte", async () => {
    const dashboard = await dbAdmin.transaction((tx) => loadConversionDashboard(tx, PERIOD));

    const activity = dashboard.byActivity.find((row) => row.activityId === activityId);
    expect(activity).toMatchObject({ clicks: 1, conversions: 1 });

    const unlinked = dashboard.unlinked.map((row) => row.subid);
    expect(unlinked).toEqual(expect.arrayContaining([unlinkedSubid, csvUnlinkedSubid]));
    expect(unlinked).not.toContain(linkedSubid);
  });

  it("una conversione del periodo conta nel contesto del click anche se il click è prima del periodo", async () => {
    const dashboard = await dbAdmin.transaction((tx) => loadConversionDashboard(tx, PERIOD));

    const linked = await dbAdmin
      .select({ subid: affiliateConversions.subid })
      .from(affiliateConversions)
      .innerJoin(affiliateClicks, eq(affiliateClicks.subid, affiliateConversions.subid))
      .where(
        and(
          gte(affiliateConversions.reportedAt, PERIOD.start),
          lt(affiliateConversions.reportedAt, PERIOD.endExclusive),
          ne(affiliateConversions.status, "cancelled"),
        ),
      );

    const byContextConversions = dashboard.byContext.reduce((sum, row) => sum + row.conversions, 0);
    expect(byContextConversions).toBe(linked.length);
    const flights = dashboard.byContext.find((row) => row.key === "flights");
    expect(flights?.conversions).toBeGreaterThanOrEqual(1);
  });

  it("l'esportazione ha una riga per conversione del periodo con il contesto del click", async () => {
    const rows = await dbAdmin.transaction((tx) => loadConversionExportRows(tx, PERIOD));
    const linked = rows.find((row) => row.subid === linkedSubid);
    expect(linked).toMatchObject({
      partner: "getyourguide",
      context: "itinerary",
      activityTitle,
      commissionEur: "9.60",
      status: "approved",
    });
  });
});

describe("possibili duplicati nell'anteprima", () => {
  it("una riga nuova senza external_id con un subid già convertito è segnalata", async () => {
    const columns = CONVERSION_COLUMNS.filter((column) => column !== "external_id");
    const text = [
      columns.join(","),
      ["getyourguide", linkedSubid, "130.00", "10.40", "approvata", "2026-10-10"].join(","),
    ].join("\n") + "\n";
    const view = expectPreview(await preview(text));
    expect(view.totals).toMatchObject({ create: 1, possibleDuplicate: 1 });
    expect(view.rows[0]?.possibleDuplicate).toBe(true);
  });
});
