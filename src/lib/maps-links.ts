// Link alle app di mappa per una tappa (passo 11.3). Logica pura.
//
// Google Maps si apre con le coordinate; Mappe di Apple mostra anche il nome del luogo. Senza
// coordinate non ci sono link (null): la tappa resta, senza i pulsanti della mappa.

export type MapsLinks = { google: string; apple: string };

export function mapsLinks(lat: number | null, lng: number | null, label: string): MapsLinks | null {
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const coords = `${lat},${lng}`;
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${coords}`,
    apple: `https://maps.apple.com/?ll=${coords}&q=${encodeURIComponent(label)}`,
  };
}
