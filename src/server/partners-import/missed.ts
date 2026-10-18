// Macchina dei "import mancati" delle offerte (codice puro). Dato lo stato delle offerte attive
// di un partner e i prodotti visti nell'import riuscito, restituisce gli aggiornamenti da
// scrivere. Un import fallito non chiama questa funzione.

export const MISSED_IMPORTS_LIMIT = 3;

export type OfferCounter = {
  id: string;
  partnerProductId: string;
  missedImports: number;
  isActive: boolean;
};

export type MissedUpdate = { id: string; missedImports: number; isActive: boolean };

// Offerte attive non viste in questo import: +1 mancato; alla soglia (3) l'offerta si disattiva.
// Le offerte viste non compaiono: il loro contatore torna a 0 con l'upsert dell'import.
export function planMissedUpdates(
  activeOffers: readonly OfferCounter[],
  seenProductIds: ReadonlySet<string>,
): MissedUpdate[] {
  const updates: MissedUpdate[] = [];
  for (const offer of activeOffers) {
    if (!offer.isActive || seenProductIds.has(offer.partnerProductId)) continue;
    const missedImports = offer.missedImports + 1;
    updates.push({ id: offer.id, missedImports, isActive: missedImports < MISSED_IMPORTS_LIMIT });
  }
  return updates;
}
