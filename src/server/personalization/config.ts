import "server-only";

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
} as const;
