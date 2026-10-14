// Ordine delle tappe nel builder del viaggio (1.4): ogni giorno è un elenco di id di tappa.
// Spostamenti su/giù, rilascio di una tappa trascinata (su un'altra tappa o sulla zona di un
// giorno) e l'elenco delle posizioni per reorderTrip. Logica pura: nessun accesso al database.

export type DayOrder = string[][];

export type Placement = { id: string; dayIndex: number; position: number };

const DAY_ZONE_PREFIX = "day-";

// Id della zona di rilascio di un giorno (il giorno intero, anche se vuoto).
export function dayZoneId(dayIndex: number): string {
  return `${DAY_ZONE_PREFIX}${dayIndex}`;
}

// Il giorno di una zona di rilascio; null se l'id non è una zona.
export function dayFromZoneId(id: string): number | null {
  if (!id.startsWith(DAY_ZONE_PREFIX)) return null;
  const dayIndex = Number(id.slice(DAY_ZONE_PREFIX.length));
  return Number.isInteger(dayIndex) && dayIndex >= 0 ? dayIndex : null;
}

// Tutte le tappe con giorno e posizione da 0: il formato di reorderTrip.
export function placements(order: DayOrder): Placement[] {
  return order.flatMap((ids, dayIndex) => ids.map((id, position) => ({ id, dayIndex, position })));
}

// Giorno e posizione (da 0) di una tappa; null se non c'è.
export function locate(order: DayOrder, id: string): { dayIndex: number; index: number } | null {
  for (let dayIndex = 0; dayIndex < order.length; dayIndex++) {
    const index = (order[dayIndex] ?? []).indexOf(id);
    if (index !== -1) return { dayIndex, index };
  }
  return null;
}

function move<T>(values: readonly T[], from: number, to: number): T[] {
  const next = [...values];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  if (item === undefined) return [...values];
  next.splice(to, 0, item);
  return next;
}

function sameOrder(a: DayOrder, b: DayOrder): boolean {
  return a.length === b.length && a.every((ids, i) => ids.join("|") === (b[i] ?? []).join("|"));
}

// Su o giù nello stesso giorno; null se la tappa è già in cima o in fondo.
export function stepInDay(order: DayOrder, id: string, step: -1 | 1): DayOrder | null {
  const found = locate(order, id);
  if (!found) return null;
  const ids = order[found.dayIndex] ?? [];
  const target = found.index + step;
  if (target < 0 || target >= ids.length) return null;
  return order.map((day, i) => (i === found.dayIndex ? move(day, found.index, target) : day));
}

// Rilascio di una tappa (activeId) su un'altra tappa (overId: la prende il suo posto, anche in
// un altro giorno) o sulla zona di un giorno (overId = dayZoneId: in fondo a quel giorno).
// Null se non cambia nulla o se un id non esiste.
export function dropOn(order: DayOrder, activeId: string, overId: string): DayOrder | null {
  const from = locate(order, activeId);
  if (!from) return null;

  let toDay: number;
  let toIndex: number;
  const zone = dayFromZoneId(overId);
  if (zone !== null) {
    if (zone >= order.length) return null;
    toDay = zone;
    toIndex = (order[zone] ?? []).length;
  } else {
    const to = locate(order, overId);
    if (!to) return null;
    toDay = to.dayIndex;
    toIndex = to.index;
  }

  let next: DayOrder;
  if (toDay === from.dayIndex) {
    next = order.map((day, i) => (i === toDay ? move(day, from.index, Math.min(toIndex, day.length - 1)) : day));
  } else {
    next = order.map((day, i) => {
      if (i === from.dayIndex) return day.filter((id) => id !== activeId);
      if (i === toDay) {
        const copy = [...day];
        copy.splice(toIndex, 0, activeId);
        return copy;
      }
      return day;
    });
  }
  return sameOrder(next, order) ? null : next;
}
