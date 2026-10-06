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

// Aeroporti di arrivo (coordinate delle piste). Bonus piccolo, che rompe la parità tra aree
// simili e non ribalta la classifica: pieno a distanza 0, nullo oltre rangeKm. Il motivo
// "vicina all'aeroporto" compare entro nearKm (distanza in linea d'aria dal centro dell'area).
export const AIRPORTS = {
  CTA: { lat: 37.4668, lng: 15.0664 },
  PMO: { lat: 38.176, lng: 13.091 },
  TPS: { lat: 37.9114, lng: 12.488 },
  CIY: { lat: 36.9946, lng: 14.6072 },
} as const;
export const AIRPORT_BONUS = { max: 0.02, rangeKm: 120, nearKm: 70 } as const;

// Motivi d'area: voto medio delle tappe da cui vale la pena dirlo.
export const AREA_TOP_RATING = 4.6;
