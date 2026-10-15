// Periodo della dashboard e dell'esportazione delle conversioni (passo 3.3). Pura: nessun accesso
// al database. Tutti i giorni sono UTC. Lo stato sta nell'URL: giorni=7|30|90, oppure da=&a=.

export const PERIOD_DAYS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_DAYS)[number];
export const DEFAULT_PERIOD_DAYS: PeriodDays = 30;

// Intervallo personalizzato: massimo 366 giorni inclusi.
const MAX_CUSTOM_SPAN_DAYS = 366;
const DAY_MS = 86_400_000;

export type ConversionPeriod = {
  // Giorni inclusi, YYYY-MM-DD.
  from: string;
  to: string;
  // Null se il periodo è personalizzato.
  days: PeriodDays | null;
  // Primo istante incluso e primo istante escluso (intervallo semiaperto).
  start: Date;
  endExclusive: Date;
};

export type PeriodParams = {
  giorni?: string | null;
  da?: string | null;
  a?: string | null;
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Data YYYY-MM-DD all'inizio del giorno UTC, o null se non è un giorno valido.
export function parseIsoDay(raw: string | null | undefined): Date | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  if (!DAY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function presetDays(raw: string | null | undefined): PeriodDays {
  const value = Number(raw);
  return (PERIOD_DAYS as readonly number[]).includes(value) ? (value as PeriodDays) : DEFAULT_PERIOD_DAYS;
}

// Risolve il periodo dai parametri dell'URL. Parametri non validi ricadono sul periodo predefinito
// (ultimi 30 giorni, fino a oggi incluso). Da/a validi (da <= a, al massimo 366 giorni) hanno la precedenza.
export function resolvePeriod(params: PeriodParams, now: Date): ConversionPeriod {
  const from = parseIsoDay(params.da);
  const to = parseIsoDay(params.a);
  if (from && to && from.getTime() <= to.getTime() && (to.getTime() - from.getTime()) / DAY_MS < MAX_CUSTOM_SPAN_DAYS) {
    return {
      from: toIsoDay(from),
      to: toIsoDay(to),
      days: null,
      start: from,
      endExclusive: new Date(to.getTime() + DAY_MS),
    };
  }

  const days = presetDays(params.giorni);
  const endExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS);
  const start = new Date(endExclusive.getTime() - days * DAY_MS);
  return {
    from: toIsoDay(start),
    to: toIsoDay(new Date(endExclusive.getTime() - DAY_MS)),
    days,
    start,
    endExclusive,
  };
}
