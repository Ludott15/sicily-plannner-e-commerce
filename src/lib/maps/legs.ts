// Tratte stradali tra luoghi (mappa degli itinerari). Tipi e funzioni pure, sicuri anche nel browser:
// il calcolo sta in src/server/maps (OSRM, cache in place_legs).

export type LatLng = { lat: number; lng: number };

// Una tratta guidata tra due luoghi. coordinates segue la strada, [lng, lat], semplificata.
export type RouteLeg = {
  fromPlaceId: string;
  toPlaceId: string;
  distanceM: number;
  durationS: number;
  coordinates: [number, number][];
};

// Il risultato del router non conosce gli id dei luoghi: li aggiunge chi lo salva.
export type RouteShape = Omit<RouteLeg, "fromPlaceId" | "toPlaceId">;

export type LegPair = { from: string; to: string };

// Coppie consecutive di luoghi diversi, in ordine di tappa. Il null (tappa senza luogo, per esempio
// un titolo libero) viene saltato: la tratta collega i due luoghi che stanno ai lati.
export function consecutiveLegPairs(placeIds: readonly (string | null | undefined)[]): LegPair[] {
  const known = placeIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  const pairs: LegPair[] = [];
  for (let i = 1; i < known.length; i++) {
    const from = known[i - 1]!;
    const to = known[i]!;
    if (from !== to) pairs.push({ from, to });
  }
  return pairs;
}

// "≈ 1 h 20 min", "≈ 25 min", "≈ 1 h". Sotto il minuto si arrotonda al minuto.
export function formatDuration(seconds: number, locale: "it" | "en"): string {
  const numbers = new Intl.NumberFormat(locale === "it" ? "it-IT" : "en-GB");
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${numbers.format(hours)} h`);
  if (rest > 0 || hours === 0) parts.push(`${numbers.format(rest)} min`);
  return `≈ ${parts.join(" ")}`;
}

// "850 m", "4,5 km" (it) / "4.5 km" (en), "62 km". Da 10 km in su niente decimali.
export function formatDistance(meters: number, locale: "it" | "en"): string {
  if (meters < 995) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  const formatter = new Intl.NumberFormat(locale === "it" ? "it-IT" : "en-GB", {
    maximumFractionDigits: km < 10 ? 1 : 0,
  });
  return `${formatter.format(km)} km`;
}
