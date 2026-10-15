// Stagioni della classifica (passo 5.3). Specchio di public.season_for in
// supabase/migrations/20260927210752_gamification_affiliates_rls.sql: estate aprile-settembre,
// inverno ottobre-marzo etichettato con l'anno in cui inizia ("2026-inverno" è gennaio 2027).
// Il calcolo è sull'ora italiana. Cambiare una regola vuol dire cambiarla in entrambi.
// Puro (nessun server-only): lo usano la UI e i test.

export const SEASON_PATTERN = /^[0-9]{4}-(estate|inverno)$/;

const ROME_TZ = "Europe/Rome";

export function isSeasonKey(value: string): boolean {
  return SEASON_PATTERN.test(value);
}

type RomeParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

// Data e ora sull'orologio di Roma, letti con Intl (corretti per l'ora legale).
function romeParts(date: Date): RomeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ROME_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

// Scostamento di Roma rispetto a UTC in quell'istante, in millisecondi (+1h inverno, +2h estate).
function romeOffsetMs(instant: Date): number {
  const parts = romeParts(instant);
  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const truncatedInstant = Math.floor(instant.getTime() / 1000) * 1000;
  return wallClockAsUtc - truncatedInstant;
}

// Mezzanotte di Roma del giorno indicato, come istante reale. L'ora legale non cambia mai
// il primo giorno di aprile o di ottobre, quindi l'offset calcolato sulla mezzanotte UTC basta.
function romeMidnight(year: number, month: number, day: number): Date {
  const utcMidnight = Date.UTC(year, month - 1, day);
  return new Date(utcMidnight - romeOffsetMs(new Date(utcMidnight)));
}

// Chiave della stagione di un istante, nell'ora italiana.
export function seasonOf(date: Date): string {
  const { year, month } = romeParts(date);
  if (month >= 4 && month <= 9) return `${year}-estate`;
  if (month >= 10) return `${year}-inverno`;
  return `${year - 1}-inverno`;
}

// Intervallo di una stagione: estremo iniziale incluso, finale escluso (inizio della stagione
// successiva), entrambi a mezzanotte di Roma. Lancia un errore per una chiave non valida.
export function seasonRange(season: string): { from: Date; to: Date } {
  const match = SEASON_PATTERN.exec(season);
  if (!match) throw new Error("invalid_season");
  const year = Number(season.slice(0, 4));
  if (season.endsWith("-estate")) {
    return { from: romeMidnight(year, 4, 1), to: romeMidnight(year, 10, 1) };
  }
  return { from: romeMidnight(year, 10, 1), to: romeMidnight(year + 1, 4, 1) };
}

// Nome mostrato in classifica. Specchio di public.public_name_for: il nome scelto se c'è, altrimenti
// le iniziali del nome dell'account ("Mario Rossi" -> "M. R."); senza nome, "Viaggiatore".
export function publicNameOf(displayName: string | null, fallbackName: string | null): string {
  const name = displayName?.trim() ?? "";
  if (name !== "") return name;

  const words = (fallbackName ?? "").trim().split(/\s+/).filter((word) => word !== "");
  const firstWord = words[0];
  if (firstWord === undefined) return "Viaggiatore";

  const initial = (word: string): string => `${(Array.from(word)[0] ?? "").toUpperCase()}.`;
  const lastWord = words[words.length - 1] ?? firstWord;
  return words.length === 1 ? initial(firstWord) : `${initial(firstWord)} ${initial(lastWord)}`;
}
