import type { ImportRegion, PartnerCatalogAdapter, PartnerName } from "../types";
import { createGetYourGuideAdapter } from "./getyourguide";
import { createViatorAdapter } from "./viator";

// Partner con un adattatore reale (l'ordine è quello dell'import in sequenza).
export const IMPORT_PARTNERS = ["viator", "getyourguide"] as const satisfies readonly PartnerName[];

// Adattatori attivi. Ogni partner gira solo con la sua chiave nelle variabili d'ambiente:
// senza chiave isConfigured() è false e l'import lo salta (nessuna riga di log, nessuna
// disattivazione).

// Area dell'import: la Sicilia. Il codice va verificato con i codici di destinazione dei partner.
export const SICILIA_REGION: ImportRegion = { code: "sicilia" };

export function createAdapters(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl?: typeof fetch,
): PartnerCatalogAdapter[] {
  return [
    createViatorAdapter({ apiKey: nonEmpty(env.VIATOR_API_KEY), fetchImpl }),
    createGetYourGuideAdapter({ apiKey: nonEmpty(env.GETYOURGUIDE_API_KEY), fetchImpl }),
  ];
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
