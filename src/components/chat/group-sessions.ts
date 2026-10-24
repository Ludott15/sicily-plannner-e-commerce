// Gruppi dell'elenco delle conversazioni: Oggi, Ultimi 7 giorni, Prima. Il confronto usa il giorno di
// calendario locale di chi guarda. Puro: il tempo "adesso" arriva come parametro (niente Date.now qui).

export type ChatSessionListItem = {
  id: string;
  title: string | null;
  updatedAt: string;
};

export type SessionGroupKey = "today" | "week" | "older";

export type SessionGroup<T extends ChatSessionListItem> = {
  key: SessionGroupKey;
  items: T[];
};

const ORDER: readonly SessionGroupKey[] = ["today", "week", "older"];

export function groupSessionsByAge<T extends ChatSessionListItem>(sessions: readonly T[], now: Date): SessionGroup<T>[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // Sei giorni prima di oggi: con oggi fanno sette giorni.
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
  const buckets: Record<SessionGroupKey, T[]> = { today: [], week: [], older: [] };

  for (const session of sessions) {
    const time = new Date(session.updatedAt).getTime();
    if (time >= startOfToday) buckets.today.push(session);
    else if (time >= startOfWeek) buckets.week.push(session);
    else buckets.older.push(session);
  }

  return ORDER.filter((key) => buckets[key].length > 0).map((key) => ({ key, items: buckets[key] }));
}
