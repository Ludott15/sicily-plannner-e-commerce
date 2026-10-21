import "server-only";
import { keywords, type CommonsCandidate, type SearchTarget } from "./commons-search";

// Cosa cercare su Commons per un'entità senza foto, e quando un candidato è pertinente. Pura: niente
// database né richieste, così è testabile. Usata dall'assegnazione automatica (commons-fill.admin.ts)
// e dalla ricerca manuale (commons-actions.admin.ts).

export const cleanName = (name: string) => name.replace(/\[DEMO\]\s*/gi, "").trim();

// Cosa cercare per ogni tipo di entità. Luoghi: vicino alle coordinate o per nome, con almeno una
// parola del nome nel file. Attività: titolo e luogo come query, ma la foto deve riguardare il titolo.
// Itinerari: solo Wikipedia (la copertina ripiega sulla foto del luogo della prima tappa).
// Ciò che serve per cercare un'entità (una PhotoNeed di admin-queries.admin.ts, senza importarlo qui).
export type PhotoNeedShape = {
  type: "area" | "place" | "activity" | "itinerary";
  name: string;
  placeName: string | null;
  lat: number | null;
  lng: number | null;
};

export function photoTarget(need: PhotoNeedShape): SearchTarget {
  const name = cleanName(need.name);
  const words = keywords(name).join(" ");
  if (need.type === "place") return { name, query: words || name, lat: need.lat, lng: need.lng, requireNameMatch: false };
  if (need.type === "area") return { name, query: `${words} Sicilia`, lat: null, lng: null, requireNameMatch: true };
  const placeWords = need.placeName ? keywords(need.placeName).join(" ") : "";
  return { name, query: [words, placeWords].filter(Boolean).join(" ") || name, lat: need.lat, lng: need.lng, requireNameMatch: true };
}

// Pertinenza automatica (la ricerca manuale mostra tutti i candidati, l'admin sceglie).
// Luogo: almeno una parola del nome nel titolo o nella descrizione, senza vicinanza da sola.
// Attività: almeno una parola che non sia del solo luogo ("Teatro Antico" e non "Taormina").
export function isPertinent(need: Pick<PhotoNeedShape, "type" | "placeName">, candidate: Pick<CommonsCandidate, "matched">): boolean {
  if (candidate.matched.length === 0) return false;
  if (need.type !== "activity") return true;
  const placeWords = new Set(keywords(need.placeName ?? ""));
  return candidate.matched.some((word) => !placeWords.has(word));
}
