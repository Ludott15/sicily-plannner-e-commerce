// Foto delle tappe di un itinerario (docs/IMMAGINI.md, catena di ripiego): nessuna foto si ripete
// nello stesso itinerario. Funzione pura, testata in itinerary-photos.test.ts.

// Ogni tappa ha la sua catena di foto, già risolta in id di media: attività → luogo → area.
// Le tappe arrivano nell'ordine dell'itinerario (giorno, poi posizione).
export function assignStopPhotos<T extends { key: string; chain: (string | null)[] }>(
  stops: T[],
  reserved: ReadonlySet<string> = new Set(),
): Map<string, string | null> {
  const used = new Set(reserved);
  const picked = new Map<string, string | null>();
  for (const stop of stops) {
    // La prima foto della catena che nell'itinerario non è ancora usata; altrimenti nessuna foto.
    const photo = stop.chain.find((id): id is string => id !== null && !used.has(id)) ?? null;
    if (photo !== null) used.add(photo);
    picked.set(stop.key, photo);
  }
  return picked;
}
