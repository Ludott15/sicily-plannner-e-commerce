// Coppie di aree (M4 parte 4): le parti pure della composizione a due aree. Il motore
// (engine.ts) compone i giorni; qui solo le coppie candidate, la ripartizione dei giorni e
// l'ordine di visita. Nessun accesso al database, nessuna dipendenza dal motore.

import { parsePairKey, type DriveTimes } from "@/lib/drive-pairs";

export { pairKey } from "@/lib/drive-pairs";

export type PairCandidate = { key: string; areas: [string, string]; driveMinutes: number };

// Coppie con guida in matrice non oltre maxDriveMin, in ordine di chiave.
export function pairCandidates(driveTimes: DriveTimes, maxDriveMin: number): PairCandidate[] {
  const out: PairCandidate[] = [];
  for (const [key, driveMinutes] of driveTimes) {
    const areas = parsePairKey(key);
    if (areas && driveMinutes <= maxDriveMin) out.push({ key, areas, driveMinutes });
  }
  return out.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
}

// Giorni nella prima area (in ordine di visita): proporzionali alle quote d'area, almeno 1 e
// almeno 1 nella seconda. null se i giorni sono meno di 2 o nessuna area ha punteggio.
export function firstAreaDays(days: number, firstShare: number, secondShare: number): number | null {
  const total = firstShare + secondShare;
  if (days < 2 || !(total > 0)) return null;
  return Math.min(days - 1, Math.max(1, Math.round((days * firstShare) / total)));
}

// Ordine di visita: prima l'area con la quota più alta; a parità, lo slug in ordine di codice.
export function visitOrder<T extends { area: string; share: number }>(a: T, b: T): [T, T] {
  const bFirst = b.share > a.share || (b.share === a.share && b.area < a.area);
  return bFirst ? [b, a] : [a, b];
}
