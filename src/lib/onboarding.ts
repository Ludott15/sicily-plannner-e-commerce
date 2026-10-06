// Valori neutri delle domande saltate (docs/spec.md, "Onboarding"). Puro: lo usano il server,
// il motore, il client e i test. Una domanda saltata non restringe mai il risultato.
export const NEUTRAL = {
  // Giorni: 3, un viaggio breve da cui partire.
  days: 3,
  // Ritmo: equilibrato (6 ore al giorno).
  pace: "balanced",
  // Peso di un interesse scelto senza passare dalla domanda 3.
  weight: 3,
} as const;

// Domande dell'onboarding, nell'ordine: ognuna ha il suo indirizzo (?domanda=N).
export const QUESTIONS = ["days", "interests", "weights", "pace", "party", "airport", "budget"] as const;
export type Question = (typeof QUESTIONS)[number];

// Valore a parole del peso 0-5 (accanto all'etichetta e come aria-valuetext).
export const WEIGHT_WORDS = ["none", "little", "some", "fair", "much", "most"] as const;
