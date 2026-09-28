// Filtri della lista attività nell'URL: /attivita?interessi=sea,food_wine&provincia=TP.
// Interessi: basta uno dei selezionati; provincia: una sola. I valori sconosciuti si
// ignorano, così un link vecchio o scritto a mano mostra comunque una lista.

export type ActivityFilters = { interests: string[]; province: string | null };

export type ActivitySearchParams = { interessi?: string | string[]; provincia?: string | string[] };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseActivityFilters(
  params: ActivitySearchParams,
  allowed: { interests: readonly string[]; provinces: readonly string[] },
): ActivityFilters {
  const requested = new Set((first(params.interessi) ?? "").split(",").map((k) => k.trim()));
  const province = first(params.provincia)?.trim().toUpperCase() ?? "";
  return {
    // Nell'ordine delle opzioni, così lo stesso filtro ha sempre lo stesso URL.
    interests: allowed.interests.filter((k) => requested.has(k)),
    province: allowed.provinces.includes(province) ? province : null,
  };
}

// Query string dei filtri, vuota senza filtri.
export function activityFiltersQuery(filters: ActivityFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.interests.length > 0) query.interessi = filters.interests.join(",");
  if (filters.province) query.provincia = filters.province;
  return query;
}
