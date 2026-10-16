import "server-only";
import { sql } from "drizzle-orm";
import { dbPublic } from "@/server/db/public";
import {
  groupSearchRows,
  isSearchKind,
  normalizeSearchQuery,
  type SearchGroups,
  type SearchRow,
} from "./model";

// Tipi condivisi con l'interfaccia (import di soli tipi: nessun codice server nel client).
export type { SearchGroups, SearchHit, SearchKind } from "./model";

// Ricerca nel sito (passo 11.2). Passa da dbPublic: la funzione SQL public.search_site è SECURITY
// INVOKER, quindi il pubblico trova solo ciò che la RLS e i filtri di pubblicazione lasciano vedere.

const MAX_PER_KIND = 20;

type SearchSqlRow = {
  kind: string;
  slug: string;
  title: string;
  subtitle: string | null;
};

// Risultati della ricerca raggruppati per tipo. Una query sotto 2 caratteri non interroga il
// database. perKind limita i risultati per tipo (tra 1 e 20). Locale "en" usa i titoli inglesi
// quando ci sono, altrimenti quelli italiani.
export async function searchSite(query: string, locale: string, perKind: number): Promise<SearchGroups> {
  const normalized = normalizeSearchQuery(query);
  if (normalized === "") return { query: "", total: 0, groups: [] };

  const limit = Math.min(Math.max(1, Math.floor(perKind)), MAX_PER_KIND);
  const found = await dbPublic((tx) =>
    tx.execute<SearchSqlRow>(
      sql`select kind, slug, title, subtitle from public.search_site(${normalized}, ${locale}, ${limit})`,
    ),
  );

  const rows: SearchRow[] = [];
  for (const row of found) {
    if (isSearchKind(row.kind)) {
      rows.push({ kind: row.kind, slug: row.slug, title: row.title, subtitle: row.subtitle });
    }
  }
  return groupSearchRows(normalized, rows, limit);
}
