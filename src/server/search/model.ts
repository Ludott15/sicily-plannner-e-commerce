// Ricerca interna del sito (passo 11.2): tipi, normalizzazione della query, href e raggruppamento.
// Funzioni pure: nessun accesso al database, testate in model.test.ts.

export const SEARCH_KINDS = ["place", "activity", "itinerary", "guide", "product"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export type SearchHit = {
  kind: SearchKind;
  slug: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type SearchGroups = {
  query: string;
  total: number;
  // Gruppi non vuoti, nell'ordine di SEARCH_KINDS.
  groups: { kind: SearchKind; hits: SearchHit[] }[];
};

// Riga grezza di search_site (già ordinata per tipo e punteggio).
export type SearchRow = {
  kind: SearchKind;
  slug: string;
  title: string;
  subtitle: string | null;
};

export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_QUERY_MAX_LENGTH = 100;

export function isSearchKind(value: string): value is SearchKind {
  return (SEARCH_KINDS as readonly string[]).includes(value);
}

// Spazi compressi, senza spazi ai bordi, al massimo 100 caratteri (contati come code point, come in
// SQL). Sotto 2 caratteri la query non si cerca: stringa vuota.
export function normalizeSearchQuery(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const capped = Array.from(collapsed).slice(0, SEARCH_QUERY_MAX_LENGTH).join("").trim();
  return Array.from(capped).length >= SEARCH_QUERY_MIN_LENGTH ? capped : "";
}

// Percorso pubblico di un risultato, senza prefisso di lingua (lo aggiunge il Link di next-intl).
// I prodotti non hanno ancora una pagina pubblica: senza href non compaiono nei risultati.
export function searchHref(kind: SearchKind, slug: string): string | null {
  switch (kind) {
    case "place":
      return `/luoghi/${slug}`;
    case "activity":
      return `/attivita/${slug}`;
    case "itinerary":
      return `/itinerari/${slug}`;
    case "guide":
      return `/guide/${slug}`;
    case "product":
      return null;
  }
}

// Raggruppa le righe per tipo, al massimo perKind per tipo, nell'ordine di SEARCH_KINDS.
// Le righe senza href si scartano (il totale conta solo i risultati mostrabili).
export function groupSearchRows(query: string, rows: readonly SearchRow[], perKind: number): SearchGroups {
  if (query === "") return { query, total: 0, groups: [] };
  const limit = Math.max(1, Math.floor(perKind));
  const byKind = new Map<SearchKind, SearchHit[]>();

  for (const row of rows) {
    const href = searchHref(row.kind, row.slug);
    if (href === null) continue;
    const hits = byKind.get(row.kind) ?? [];
    if (hits.length >= limit) continue;
    hits.push({ kind: row.kind, slug: row.slug, title: row.title, subtitle: row.subtitle, href });
    byKind.set(row.kind, hits);
  }

  const groups = SEARCH_KINDS.flatMap((kind) => {
    const hits = byKind.get(kind);
    return hits && hits.length > 0 ? [{ kind, hits }] : [];
  });
  const total = groups.reduce((sum, group) => sum + group.hits.length, 0);
  return { query, total, groups };
}
