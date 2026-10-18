import { isIsoDate, tripEndDate } from "./trip-days";

// "Oggi" nella pagina del viaggio (passo 11.3). Logica pura: nessun accesso al database né import server-only.
//
// Ritorna l'indice del giorno (da 0, come nel database) se la data di oggi cade tra la partenza e
// l'ultimo giorno del viaggio, altrimenti null. Date ISO YYYY-MM-DD; "oggi" è la data di Europe/Rome
// calcolata dal server (romeToday in trip-days).

const DAY_MS = 24 * 60 * 60 * 1000;

function utcMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

export function tripDayIndex(startDate: string | null, days: number, today: string): number | null {
  if (startDate === null || !isIsoDate(startDate) || !isIsoDate(today) || days < 1) return null;
  const end = tripEndDate(startDate, days);
  if (end === null || today < startDate || today > end) return null;
  const index = Math.round((utcMs(today) - utcMs(startDate)) / DAY_MS);
  return index >= 0 && index < days ? index : null;
}
