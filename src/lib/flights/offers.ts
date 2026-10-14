// Logica pura sui prezzi dei voli: migliore offerta e calendario del mese. Nessun I/O qui
// (le chiamate al fornitore stanno in src/server/flights/).

export type OfferPrice = {
  origin: string;
  destination: string;
  departureAt: string;
  returnAt: string | null;
  price: number;
  airline: string | null;
  transfers: number;
  // Data di aggiornamento del prezzo dal fornitore, o l'ora della chiamata se non la dà.
  updatedAt: string;
};

export type CalendarDay = { date: string; price: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// L'offerta più economica; a parità di prezzo la partenza più vicina.
export function pickBest(prices: readonly OfferPrice[]): OfferPrice | null {
  let best: OfferPrice | null = null;
  for (const price of prices) {
    if (best === null || price.price < best.price || (price.price === best.price && price.departureAt < best.departureAt)) {
      best = price;
    }
  }
  return best;
}

// Prezzo minimo per giorno di partenza, in ordine di data.
export function calendarDays(prices: readonly OfferPrice[]): CalendarDay[] {
  const byDay = new Map<string, number>();
  for (const price of prices) {
    const date = price.departureAt.slice(0, 10);
    if (!ISO_DATE.test(date)) continue;
    const current = byDay.get(date);
    if (current === undefined || price.price < current) byDay.set(date, price.price);
  }
  return [...byDay.entries()]
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Mese successivo a now (UTC) in formato YYYY-MM: il mese di andata predefinito per le pagine di coppia.
export function nextMonth(now: Date): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}
