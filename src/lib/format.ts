// Formattazioni condivise dalle pagine del catalogo (funzioni pure, testate in format.test.ts).

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

// Tempo di guida tra due aree: "1 h 40", "1 h", "45 min", "2 h 05" (i minuti a due cifre).
export function formatDriveTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

// Drizzle restituisce i numeric come stringa. null = prezzo non indicato. La valuta è EUR
// salvo le offerte dei partner, che possono averne un'altra.
export function formatEur(value: string | null, locale: string, currency = "EUR"): string | null {
  if (value === null) return null;
  const amount = Number(value);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

// Mesi consecutivi compressi in intervalli: [5,6,7,8,9,10] → "maggio – ottobre".
export function formatSeason(months: number[], locale: string): string | null {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  if (sorted.length === 0 || sorted.length === 12) return null;

  const name = (m: number) =>
    new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(Date.UTC(2026, m - 1, 1));

  const ranges: [number, number][] = [];
  for (const m of sorted) {
    const last = ranges.at(-1);
    if (last && m === last[1] + 1) last[1] = m;
    else ranges.push([m, m]);
  }
  return ranges.map(([a, b]) => (a === b ? name(a) : `${name(a)} – ${name(b)}`)).join(", ");
}
