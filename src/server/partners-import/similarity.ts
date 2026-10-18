// Somiglianza dei nomi per collegare un prodotto del partner a un'attività esistente.
// Codice puro: Dice sui bigrammi dei token normalizzati (minuscolo, senza accenti, senza
// punteggiatura né parole vuote italiane o inglesi).

export const NAME_MATCH_MIN = 0.55;

const STOPWORDS = new Set([
  // italiano
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "da", "del", "della", "dei",
  "delle", "degli", "e", "ed", "o", "in", "con", "su", "per", "tra", "fra", "al", "alla", "allo",
  "ai", "agli", "alle", "dal", "dalla", "nel", "nella",
  // inglese
  "a", "an", "the", "of", "and", "or", "with", "in", "on", "at", "to", "for", "from", "by",
]);

export function normalizeName(input: string): string[] {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

// Bigrammi per token (un token di una lettera vale come unità): multiset, quindi un bigramma
// ripetuto conta quante volte compare.
export function bigrams(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    const units = token.length === 1 ? [token] : Array.from({ length: token.length - 1 }, (_, i) => token.slice(i, i + 2));
    for (const unit of units) counts.set(unit, (counts.get(unit) ?? 0) + 1);
  }
  return counts;
}

// Coefficiente di Dice in [0, 1]. Simmetrica; 0 se uno dei due nomi non ha token utili.
export function nameSimilarity(a: string, b: string): number {
  const x = bigrams(normalizeName(a));
  const y = bigrams(normalizeName(b));
  let sizeX = 0;
  let sizeY = 0;
  let common = 0;
  for (const [unit, count] of x) {
    sizeX += count;
    common += Math.min(count, y.get(unit) ?? 0);
  }
  for (const count of y.values()) sizeY += count;
  if (sizeX + sizeY === 0) return 0;
  return (2 * common) / (sizeX + sizeY);
}
