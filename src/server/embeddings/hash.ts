import { createHash } from "node:crypto";

// Hash del contenuto di un'attività: se cambia, l'embedding va ricalcolato (codice puro).
export type EmbeddingSource = {
  title: string;
  description: string | null;
  placeName: string;
  lat: number;
  lng: number;
};

// Testo mandato al modello: titolo, descrizione e luogo, una riga ciascuno.
export function embeddingText(source: EmbeddingSource): string {
  return [source.title, source.description ?? "", `${source.placeName} (${source.lat.toFixed(4)}, ${source.lng.toFixed(4)})`].join("\n");
}

export function contentHash(source: EmbeddingSource): string {
  const canonical = JSON.stringify([source.title, source.description, source.placeName, source.lat, source.lng]);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
