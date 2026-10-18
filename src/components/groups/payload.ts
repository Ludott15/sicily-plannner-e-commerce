// Lettura tollerante del payload del registro e delle notifiche (jsonb): un campo mancante o di
// tipo diverso dà il ripiego, mai un errore di rendering.

export function textOf(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key];
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

export function dayOf(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 1;
}
