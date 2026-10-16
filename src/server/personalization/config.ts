import "server-only";
import { SICILY_AIRPORTS } from "@/lib/flights/airports";

// Coefficienti del motore di personalizzazione (docs/spec.md, "Motore di personalizzazione").
// Stanno qui e non nel codice dell'algoritmo: si cambiano senza toccare la logica.

export const SCORE_WEIGHTS = {
  match: 0.55,
  // Similarità tra embedding dell'attività e dell'utente: vale 0 fino alla milestone 11
  // (meno di 5 eventi registrati), e il suo peso passa a match.
  similarity: 0.2,
  rating: 0.15,
  fit: 0.1,
} as const;

// Ore di attività al giorno per ritmo.
export const DAILY_HOURS = { relaxed: 4, balanced: 6, intense: 8 } as const;

// Al massimo N attività con lo stesso interesse principale nello stesso giorno.
export const MAX_SAME_INTEREST_PER_DAY = 2;

// Un solo interesse forte (peso almeno strongWeight, tutti gli altri al massimo othersMax):
// per quell'interesse il limite sale a cap.
export const SINGLE_INTEREST = { strongWeight: 4, othersMax: 2, cap: 3 } as const;

// Quanti itinerari proporre.
export const PROPOSALS = 3;

// Voto usato quando un'attività non ne ha uno.
export const DEFAULT_RATING = 3.5;

// Soglie dei motivi "Per te".
export const REASONS = {
  // Un interesse conta per i motivi se l'utente gli ha dato almeno questo peso
  // e l'attività lo ha con almeno questa forza.
  strongWeight: 4,
  strongTag: 2,
  topRating: 4.7,
  // Visita breve: lascia tempo per il resto della giornata.
  shortVisitMin: 90,
} as const;

// Interesse delle attività di cibo, su cui vale il vincolo della dieta.
export const FOOD_INTEREST = "food_wine";

// Idoneità di un'area (M4 parte 3): l'area deve riempire tutti i giorni scelti, ognuno almeno
// per questa frazione delle ore del ritmo. Sotto la soglia l'area non viene mai proposta.
export const AREA_ELIGIBILITY = { minDayFill: 0.5 } as const;

// Varianti nella stessa area (meno di 3 aree idonee): le attività dell'interesse della variante
// ricevono questo vantaggio nel punteggio, così il viaggio cambia carattere.
export const VARIANT_FOCUS_BOOST = 0.5;

// Aeroporti di arrivo (coordinate delle piste), dall'elenco unico src/lib/flights/airports.ts.
// Bonus piccolo, che rompe la parità tra aree simili e non ribalta la classifica: pieno a
// distanza 0, nullo oltre rangeKm. Il motivo "vicina all'aeroporto" compare entro nearKm
// (distanza in linea d'aria dal centro dell'area).
export const AIRPORTS = SICILY_AIRPORTS;
export const AIRPORT_BONUS = { max: 0.02, rangeKm: 120, nearKm: 70 } as const;

// Motivi d'area: voto medio delle tappe da cui vale la pena dirlo.
export const AREA_TOP_RATING = 4.6;

// Viaggi su due aree adiacenti (M4 parte 4). maxDriveMin: guida massima tra le due aree per
// comporle. maxPairsInProposals: coppie al massimo tra le proposte. minTransferDayMin: minuti
// minimi per le tappe nel giorno di trasferimento (il resto va alla guida).
export const TWO_AREAS = { maxDriveMin: 150, maxPairsInProposals: 1, minTransferDayMin: 60 } as const;

// Apprendimento (M11, docs/spec.md "Passo 4, apprendimento"). Il cron notturno legge
// user_events non processati e aggiorna preference_weights.implicit. Queste costanti vanno nel
// jsonb passato a public.learn_from_events (supabase/migrations/20261016160438_learn.sql): unica fonte nel codice.
// Variazione per evento (la forza del tag divide per TAG_STRENGTH_MAX), in punti di implicit.
export const IMPLICIT_DELTAS = {
  affiliate_click: 0.5,
  add_to_itinerary: 0.4,
  save: 0.3,
  vote_up: 0.2,
  view: 0.05,
  vote_down: -0.3,
  remove_from_itinerary: -0.4,
} as const;

// Recensione: (voto - base) × scale.
export const REVIEW_DELTA = { base: 3, scale: 0.3 } as const;

// Decadimento di implicit a ogni ricalcolo di un utente con eventi nuovi, e limite dei valori.
export const IMPLICIT_DECAY = 0.05;
export const IMPLICIT_RANGE = 2;

// Forza massima di un tag (spec: 1-3): la variazione è delta × s / TAG_STRENGTH_MAX.
export const TAG_STRENGTH_MAX = 3;

// Eventi per esecuzione del cron (i più vecchi prima).
export const LEARN_EVENTS_PER_RUN = 5000;

// Embedding del profilo: media degli embedding delle attività con interazioni positive negli
// ultimi TASTE_WINDOW_DAYS giorni.
export const TASTE_WINDOW_DAYS = 90;

// Similarità attiva nello scoring solo da questo numero di eventi registrati (M11).
export const SIMILARITY_MIN_EVENTS = 5;

// Parametri del cron, passati alla funzione SQL come jsonb.
export const LEARNING_PARAMS = {
  deltas: IMPLICIT_DELTAS,
  reviewBase: REVIEW_DELTA.base,
  reviewScale: REVIEW_DELTA.scale,
  decay: IMPLICIT_DECAY,
  range: IMPLICIT_RANGE,
  strengthMax: TAG_STRENGTH_MAX,
  tasteWindowDays: TASTE_WINDOW_DAYS,
} as const;
