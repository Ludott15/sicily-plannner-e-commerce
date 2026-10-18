// Logica pura del builder (M5): nessun accesso al database, usata dal server e dai componenti.
import { SICILY_AIRPORT_CODES, SICILY_AIRPORTS, type SicilyAirportCode } from "@/lib/flights/airports";

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

// Data ISO (YYYY-MM-DD) più un numero di giorni, in calendario (nessun fuso orario).
export function addDays(isoDate: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const EARTH_RADIUS_KM = 6371;

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Aeroporto siciliano più vicino al centro dei punti (le tappe del primo giorno). null senza punti.
export function nearestSicilyAirport(points: readonly { lat: number; lng: number }[]): SicilyAirportCode | null {
  if (points.length === 0) return null;
  const center = {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
  };
  let best: SicilyAirportCode | null = null;
  let bestDistance = Infinity;
  for (const code of SICILY_AIRPORT_CODES) {
    const airport = SICILY_AIRPORTS[code];
    const d = distanceKm(center, { lat: airport.lat, lng: airport.lng });
    if (d < bestDistance) {
      bestDistance = d;
      best = code;
    }
  }
  return best;
}
