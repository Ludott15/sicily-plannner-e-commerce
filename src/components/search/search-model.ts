import type { SearchGroups, SearchHit, SearchKind } from "@/server/search/queries";

// Logica pura della ricerca nel sito, senza React: soglie, opzioni del combobox e controllo
// della risposta di /api/search/suggest (che arriva come JSON non tipizzato).

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 200;

const KINDS: readonly SearchKind[] = ["place", "activity", "itinerary", "guide", "product"];

export function shouldSearch(query: string): boolean {
  return query.trim().length >= SEARCH_MIN_LENGTH;
}

// Le opzioni nell'ordine in cui compaiono nel listbox: gruppo per gruppo, tutte in fila per le frecce.
export function flattenOptions(groups: SearchGroups): SearchHit[] {
  return groups.groups.flatMap((group) => group.hits);
}

// Pagina dei risultati completi (href senza prefisso di lingua: lo aggiunge il router).
export function searchPageHref(query: string): string {
  return `/cerca?q=${encodeURIComponent(query.trim())}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKind(value: string): value is SearchKind {
  return (KINDS as readonly string[]).includes(value);
}

function isHit(value: unknown): value is SearchHit {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    isKind(value.kind) &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    (value.subtitle === null || typeof value.subtitle === "string") &&
    typeof value.href === "string"
  );
}

// Controllo di forma della risposta: se non torna, il combobox mostra l'errore invece di crashare.
export function isSearchGroups(value: unknown): value is SearchGroups {
  if (!isRecord(value) || typeof value.query !== "string" || typeof value.total !== "number") return false;
  if (!Array.isArray(value.groups)) return false;
  return value.groups.every(
    (group: unknown) => isRecord(group) && typeof group.kind === "string" && isKind(group.kind) && Array.isArray(group.hits) && group.hits.every(isHit),
  );
}
