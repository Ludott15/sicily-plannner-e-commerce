import "server-only";
import { MAX_CONVERSION_ROWS, type ConversionRow } from "@/lib/affiliate-conversions/types";
import { dbAdmin } from "@/server/db/admin";
import { adminAuditLog } from "@/server/db/schema";
import { CONVERSION_ADAPTERS, type ConversionAdapter } from "./conversion-adapters";
import { applyConversionRows } from "./conversions-import.admin";

// Cron giornaliero delle conversioni via API (passo 3.3, 05:00 UTC). Per ogni adattatore
// configurato legge gli ultimi CONVERSION_WINDOW_DAYS giorni e scrive in una transazione, con una
// riga nel registro. Un adattatore che fallisce non ferma gli altri. Senza adattatori configurati
// non scrive nulla. Le risposte degli adattatori non si riportano: solo un codice.

const DAY_MS = 86_400_000;
export const CONVERSION_WINDOW_DAYS = 45;

export type ConversionCronOutcome =
  | { partner: string; status: "skipped" }
  | { partner: string; status: "ok"; created: number; updated: number; skipped: number }
  | { partner: string; status: "failed"; error: "too_many_rows" | "failed" };

async function collect(stream: AsyncIterable<ConversionRow>): Promise<ConversionRow[] | null> {
  const rows: ConversionRow[] = [];
  for await (const row of stream) {
    rows.push(row);
    if (rows.length > MAX_CONVERSION_ROWS) return null;
  }
  return rows;
}

async function runAdapter(adapter: ConversionAdapter, now: Date): Promise<ConversionCronOutcome> {
  if (!adapter.isConfigured()) return { partner: adapter.partner, status: "skipped" };

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const from = new Date(today - CONVERSION_WINDOW_DAYS * DAY_MS);

  try {
    const rows = await collect(adapter.fetchConversions(from, now));
    if (rows === null) return { partner: adapter.partner, status: "failed", error: "too_many_rows" };

    const applied = await dbAdmin.transaction(async (tx) => {
      const result = await applyConversionRows(tx, rows, "api");
      await tx.insert(adminAuditLog).values({
        actorId: null,
        action: "conversions.api_import",
        entity: "affiliate_conversions",
        entityId: null,
        diff: { partner: adapter.partner, ...result },
      });
      return result;
    });
    return { partner: adapter.partner, status: "ok", ...applied };
  } catch {
    console.error("runConversionImports", adapter.partner, "failed");
    return { partner: adapter.partner, status: "failed", error: "failed" };
  }
}

export async function runConversionImports(
  now: Date,
  adapters: readonly ConversionAdapter[] = CONVERSION_ADAPTERS,
): Promise<ConversionCronOutcome[]> {
  const outcomes: ConversionCronOutcome[] = [];
  for (const adapter of adapters) {
    outcomes.push(await runAdapter(adapter, now));
  }
  return outcomes;
}
