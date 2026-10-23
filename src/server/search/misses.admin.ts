import "server-only";
import { asc, desc } from "drizzle-orm";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { searchMisses } from "@/server/db/schema";

// Ricerche senza risultati per l'admin (/admin/ricerche), le più frequenti prima. dbAdmin: la RLS
// riserva la tabella all'admin, e il layout dell'area admin controlla già l'accesso.

export type SearchMissRow = {
  query: string;
  misses: number;
  firstSeen: string;
  lastSeen: string;
};

const MAX_LIMIT = 200;

export async function listSearchMisses(limit: number): Promise<SearchMissRow[]> {
  await requireAdmin();
  const rows = await dbAdmin
    .select({
      query: searchMisses.queryNorm,
      misses: searchMisses.misses,
      firstSeen: searchMisses.firstSeen,
      lastSeen: searchMisses.lastSeen,
    })
    .from(searchMisses)
    .orderBy(desc(searchMisses.misses), desc(searchMisses.lastSeen), asc(searchMisses.queryNorm))
    .limit(Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT));

  return rows.map((row) => ({
    query: row.query,
    misses: row.misses,
    firstSeen: row.firstSeen.toISOString(),
    lastSeen: row.lastSeen.toISOString(),
  }));
}
