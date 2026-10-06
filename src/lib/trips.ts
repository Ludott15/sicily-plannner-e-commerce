// Logica pura del builder (M5): nessun accesso al database, usata dal server e dai componenti.

// "Aggiungi al viaggio": il giorno proposto è il primo che ha già tappe nella stessa area
// dell'attività; altrimenti il primo giorno ancora vuoto; altrimenti il giorno con meno tappe.
// far = il viaggio ha tappe ma nessuna nell'area dell'attività: l'interfaccia lo avvisa.
export function suggestDay(
  dayAreas: string[][],
  dayStops: number[],
  area: string | null,
): { day: number; far: boolean } {
  const days = dayAreas.length;
  if (days === 0) return { day: 0, far: false };
  const sameArea = area === null ? -1 : dayAreas.findIndex((a) => a.includes(area));
  if (sameArea >= 0) return { day: sameArea, far: false };
  const hasStops = dayStops.some((n) => n > 0);
  const far = area !== null && hasStops && dayAreas.some((a) => a.length > 0);
  const empty = dayStops.findIndex((n) => n === 0);
  if (empty >= 0) return { day: empty, far };
  const fewest = dayStops.reduce((best, n, i) => (n < dayStops[best]! ? i : best), 0);
  return { day: fewest, far };
}

export type BookingKind = "activity" | "lodging" | "car" | "flight";

export type BookingEntry = {
  // Chiave stabile della voce: il tipo, più l'attività per le voci di tipo attività.
  key: string;
  kind: BookingKind;
  activityId: string | null;
  // Nome dell'attività; per alloggio, auto e voli lo traduce l'interfaccia.
  title: string | null;
  partner: string | null;
  done: boolean;
};

// Checklist "Da prenotare": alloggio e voli sempre, l'auto se una tappa la richiede, ogni
// attività del viaggio che ha un'offerta attiva (con il partner della più economica). Lo stato
// viene dalle righe di itinerary_bookings: senza riga la voce è da prenotare.
export function bookingEntries(
  stops: { activityId: string | null; title: string; requiresCar: boolean }[],
  offers: { activityId: string; partner: string }[],
  bookings: { kind: BookingKind; activityId: string | null; status: "to_book" | "booked" }[],
): BookingEntry[] {
  const done = (kind: BookingKind, activityId: string | null) =>
    bookings.some((b) => b.kind === kind && b.activityId === activityId && b.status === "booked");
  const entry = (kind: BookingKind, activityId: string | null, title: string | null, partner: string | null): BookingEntry => ({
    key: activityId ? `${kind}:${activityId}` : kind,
    kind,
    activityId,
    title,
    partner,
    done: done(kind, activityId),
  });

  const out: BookingEntry[] = [entry("lodging", null, null, null)];
  if (stops.some((s) => s.requiresCar)) out.push(entry("car", null, null, null));
  const seen = new Set<string>();
  for (const s of stops) {
    if (!s.activityId || seen.has(s.activityId)) continue;
    const offer = offers.find((o) => o.activityId === s.activityId);
    if (!offer) continue;
    seen.add(s.activityId);
    out.push(entry("activity", s.activityId, s.title, offer.partner));
  }
  out.push(entry("flight", null, null, null));
  return out;
}

// Nuovo ordine di una giornata dopo "su" o "giù": l'elenco degli id nella nuova sequenza.
export function moveInDay(ids: string[], id: string, direction: "up" | "down"): string[] {
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
