// Coppie di aree e tempi di guida (M4 parte 4): funzioni pure, usabili anche dal client.

// Minuti di guida tra due aree, per coppia (chiave pairKey). Contiene solo le coppie in matrice.
export type DriveTimes = ReadonlyMap<string, number>;

// Chiave canonica di una coppia di aree: gli slug in ordine di codice, uniti da "+".
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

// Le due aree di una chiave di coppia; null se la chiave non è una coppia.
export function parsePairKey(key: string): [string, string] | null {
  const parts = key.split("+");
  const [first, second] = parts;
  return parts.length === 2 && first && second ? [first, second] : null;
}

// Ordine di scrittura di una coppia di id (la tabella tiene area_a_id < area_b_id).
export function orderPair<T extends string>(a: T, b: T): [T, T] {
  return a < b ? [a, b] : [b, a];
}
