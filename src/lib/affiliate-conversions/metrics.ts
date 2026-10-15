// Metriche della dashboard delle conversioni (passo 3.3). Pura.

// Tasso di conversione: conversioni (non annullate) divise per i click dello stesso periodo.
// Null se non ci sono click: un rapporto senza denominatore non si mostra come zero.
export function conversionRate(clicks: number, conversions: number): number | null {
  if (!Number.isFinite(clicks) || clicks <= 0) return null;
  return conversions / clicks;
}
