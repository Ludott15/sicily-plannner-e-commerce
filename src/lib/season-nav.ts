// Stagioni per la navigazione (passo 5.3): estate aprile-settembre, inverno ottobre-marzo.
// La chiave è YYYY-estate o YYYY-inverno (come points_ledger.season); l'inverno prende l'anno di ottobre. Il mese si legge
// nel fuso Europe/Rome. È lo specchio della regola di src/lib/seasons.ts: se quella cambia,
// cambia anche questa. Funzioni pure, senza accesso al database.

export type SeasonHalf = "summer" | "winter";

export type SeasonParts = { half: SeasonHalf; year: number };

const SEASON_KEY = /^(\d{4})-(estate|inverno)$/;

export function isSeasonKey(value: string | undefined): value is string {
  return value !== undefined && SEASON_KEY.test(value);
}

export function seasonParts(key: string): SeasonParts | null {
  const match = SEASON_KEY.exec(key);
  if (!match) return null;
  const [, year = "", half = ""] = match;
  return { year: Number(year), half: half === "inverno" ? "winter" : "summer" };
}

// Indice crescente: estate e inverno dello stesso anno sono consecutivi.
function seasonIndex(parts: SeasonParts): number {
  return parts.year * 2 + (parts.half === "winter" ? 1 : 0);
}

function keyFromIndex(index: number): string {
  const year = Math.floor(index / 2);
  return `${year}-${index % 2 === 0 ? "estate" : "inverno"}`;
}

function romeYearMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return { year, month };
}

export function currentSeasonKey(now: Date = new Date()): string {
  const { year, month } = romeYearMonth(now);
  if (month >= 4 && month <= 9) return `${year}-estate`;
  return `${month >= 10 ? year : year - 1}-inverno`;
}

// Sposta di `steps` stagioni (negativo: indietro). Una chiave non valida torna com'è.
export function shiftSeason(key: string, steps: number): string {
  const parts = seasonParts(key);
  if (!parts) return key;
  return keyFromIndex(seasonIndex(parts) + steps);
}

// Vero se la stagione è finita (prima di quella in corso).
export function isSeasonOver(key: string, now: Date = new Date()): boolean {
  const parts = seasonParts(key);
  const current = seasonParts(currentSeasonKey(now));
  if (!parts || !current) return false;
  return seasonIndex(parts) < seasonIndex(current);
}
