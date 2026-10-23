// Periodo della dashboard admin (roadmap 10.1): funzioni pure, senza database. Date ISO
// yyyy-mm-dd, estremi inclusi, nel calendario di Roma.

export type DashboardRange = { from: string; to: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;

// Data ISO valida (yyyy-mm-dd) o null: 2026-02-30 non lo è.
function isoDate(value: string | undefined): string | null {
  if (value === undefined || !ISO_DATE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return value;
}

function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

// Periodo dai parametri della pagina (?da=&a=). Senza parametri validi: gli ultimi 30 giorni fino
// a oggi. Se manca un estremo, l'altro è oggi o 30 giorni prima. Da dopo a: torna il default.
// Massimo 366 giorni: il periodo si accorcia tenendo la data di fine.
export function parseDashboardRange(input: { da?: string; a?: string }, today: string): DashboardRange {
  const to = isoDate(input.a) ?? today;
  const fallback = addDays(to, -(DEFAULT_DAYS - 1));
  const from = isoDate(input.da) ?? fallback;
  if (from > to) return { from: fallback, to };
  const daysInRange = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (daysInRange > MAX_DAYS) return { from: addDays(to, -(MAX_DAYS - 1)), to };
  return { from, to };
}
