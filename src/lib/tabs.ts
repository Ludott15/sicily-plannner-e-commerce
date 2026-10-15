// Scheda attiva di una pagina con schede (brief 6.1): il valore viene dall'URL (?scheda=…). Se manca o non
// è una scheda nota, vince la prima. Funzione pura: si usa sia nei Server Component sia nei test.
export function activeTab(ids: readonly string[], raw: string | string[] | undefined): string {
  const first = ids[0];
  if (first === undefined) throw new Error("activeTab: almeno una scheda");
  const value = Array.isArray(raw) ? raw[0] : raw;
  return ids.find((id) => id === value) ?? first;
}

// Id HTML coerenti tra la lista delle schede (Tabs) e il pannello della pagina.
export function tabIds(idPrefix: string, id: string) {
  return { tab: `${idPrefix}-tab-${id}`, panel: `${idPrefix}-panel` } as const;
}
