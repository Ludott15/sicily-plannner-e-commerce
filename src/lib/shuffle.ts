// Mescolamento uniforme (Fisher-Yates) su una copia: l'input non cambia. Il generatore è
// iniettabile per i test; in produzione è Math.random, chiamato solo lato server (la home
// si renderizza a ogni richiesta, senza hydration mismatch).
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const current = out[i] as T;
    out[i] = out[j] as T;
    out[j] = current;
  }
  return out;
}
