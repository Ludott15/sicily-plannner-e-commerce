// Distanza sulla sfera (formula dell'haversine), in chilometri. Pura: nessuna dipendenza.
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Rettangolo che contiene tutti i punti, nel formato di MapLibre: [lng, lat] per sud-ovest (sw)
// e nord-est (ne). Null senza punti. Pura: nessuna dipendenza.
export function boundsOf(points: { lat: number; lng: number }[]): { sw: [number, number]; ne: [number, number] } | null {
  const first = points[0];
  if (!first) return null;
  let minLat = first.lat;
  let maxLat = first.lat;
  let minLng = first.lng;
  let maxLng = first.lng;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return { sw: [minLng, minLat], ne: [maxLng, maxLat] };
}
