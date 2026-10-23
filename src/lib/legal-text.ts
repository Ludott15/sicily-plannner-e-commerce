import { FREE_SHIPPING_THRESHOLD_CENTS, SHIPPING_FLAT_CENTS } from "./shop/config";
import type { LegalEntity } from "./legal-entity";

// Variabili dei testi legali (content/legal/*.md): {{nome}}. Il build (scripts/content/build-legal.mjs)
// rifiuta i nomi che non stanno in questo elenco, così un refuso non arriva in pagina.
export const LEGAL_VARIABLES = [
  "titolare",
  "sede",
  "partita_iva",
  "email_privacy",
  "email_assistenza",
  "spedizione_testo",
] as const;

export type LegalVariable = (typeof LEGAL_VARIABLES)[number];

// Segnaposto di un dato che manca: il titolare non è ancora completo (legal-entity.ts).
export const MISSING_VALUE = "—";

const VARIABLE_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

function formatEuro(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

// Testo della spedizione dalla configurazione dello shop (tariffa e soglia, IVA inclusa).
export function shippingText(locale: string): string {
  const flat = formatEuro(SHIPPING_FLAT_CENTS, locale);
  const threshold = formatEuro(FREE_SHIPPING_THRESHOLD_CENTS, locale);
  return `${flat} per ordine; spedizione gratuita da ${threshold} di subtotale (IVA inclusa).`;
}

function variableValues(entity: LegalEntity | null, locale: string): Record<LegalVariable, string> {
  return {
    titolare: entity?.name ?? MISSING_VALUE,
    sede: entity?.address ?? MISSING_VALUE,
    partita_iva: entity?.vatNumber ?? MISSING_VALUE,
    email_privacy: entity?.privacyEmail ?? MISSING_VALUE,
    email_assistenza: entity?.supportEmail ?? MISSING_VALUE,
    spedizione_testo: shippingText(locale),
  };
}

function isLegalVariable(name: string): name is LegalVariable {
  return (LEGAL_VARIABLES as readonly string[]).includes(name);
}

// Sostituisce le variabili con i dati del titolare. Pura. Con titolare null le variabili dei dati
// diventano "—" (mai il segnaposto grezzo). Un nome sconosciuto resta com'è: il build lo blocca prima.
export function fillLegalVariables(text: string, entity: LegalEntity | null, locale: string): string {
  const values = variableValues(entity, locale);
  return text.replace(VARIABLE_PATTERN, (match: string, name: string) =>
    isLegalVariable(name) ? values[name] : match,
  );
}
