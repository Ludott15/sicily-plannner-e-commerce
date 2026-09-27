import "server-only";
import { listInterests } from "./queries";

// Etichette degli interessi nella lingua della pagina.
export async function interestLabels(locale: string): Promise<Map<string, string>> {
  const rows = await listInterests();
  return new Map(rows.map((r) => [r.key, locale === "en" ? r.labelEn : r.labelIt]));
}
