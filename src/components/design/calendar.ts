// Funzioni pure del calendario di DateField (docs/design/components/DateField/README.md).
// Le date sono stringhe ISO "YYYY-MM-DD", come nei form e nelle azioni server. Il calcolo usa il
// conteggio dei giorni dall'epoca in UTC: niente fusi orari e niente differenze d'ora legale.

export type CivilDate = { year: number; month: number; day: number };

export type CalendarCell = { iso: string; day: number; inMonth: boolean };

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatIsoDate({ year, month, day }: CivilDate): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Restituisce null se la stringa non è una data ISO reale (es. 2026-02-30).
export function parseIsoDate(value: string | null | undefined): CivilDate | null {
  if (!value) return null;
  const match = ISO_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isValidIsoDate(value: string | null | undefined): boolean {
  return parseIsoDate(value) !== null;
}

// Giorni trascorsi dal 1970-01-01 (UTC) per una data civile.
export function dayNumber({ year, month, day }: CivilDate): number {
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function civilFromDayNumber(n: number): CivilDate {
  const date = new Date(n * MS_PER_DAY);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

// Indice del giorno della settimana con lunedì = 0 ... domenica = 6.
export function mondayIndex(n: number): number {
  return (new Date(n * MS_PER_DAY).getUTCDay() + 6) % 7;
}

export function addDays(iso: string, delta: number): string | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  return formatIsoDate(civilFromDayNumber(dayNumber(date) + delta));
}

// Sposta di un numero di mesi, tenendo il giorno se esiste, altrimenti l'ultimo del mese.
export function addMonths(iso: string, delta: number): string | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  const index = date.year * 12 + (date.month - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(date.day, daysInMonth(year, month));
  return formatIsoDate({ year, month, day });
}

// Griglia del mese: righe da sette celle, da lunedì a domenica. Le celle fuori dal mese restano
// vuote (inMonth false): nel calendario non si selezionano giorni di altri mesi.
export function monthGrid(year: number, month: number): CalendarCell[][] {
  const first = dayNumber({ year, month, day: 1 });
  const offset = mondayIndex(first);
  const length = daysInMonth(year, month);
  const weeks = Math.ceil((offset + length) / 7);
  const rows: CalendarCell[][] = [];
  for (let week = 0; week < weeks; week += 1) {
    const row: CalendarCell[] = [];
    for (let column = 0; column < 7; column += 1) {
      const index = week * 7 + column - offset;
      const inMonth = index >= 0 && index < length;
      const cellDate = civilFromDayNumber(first + index);
      row.push({ iso: formatIsoDate(cellDate), day: cellDate.day, inMonth });
    }
    rows.push(row);
  }
  return rows;
}

// Confronto lessicografico: funziona perché le date ISO hanno lunghezza fissa.
export function isDateDisabled(iso: string, min?: string, max?: string): boolean {
  if (!isValidIsoDate(iso)) return true;
  if (min && isValidIsoDate(min) && iso < min) return true;
  if (max && isValidIsoDate(max) && iso > max) return true;
  return false;
}

export function clampIsoDate(iso: string, min?: string, max?: string): string {
  if (min && isValidIsoDate(min) && iso < min) return min;
  if (max && isValidIsoDate(max) && iso > max) return max;
  return iso;
}

// Oggi nel fuso locale. Va chiamata nei gestori di eventi, non nel render (idratazione).
export function todayIso(now: Date = new Date()): string {
  return formatIsoDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

export function monthKey(iso: string): string | null {
  const date = parseIsoDate(iso);
  return date ? `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}` : null;
}
