// Consensi registrati (passo 8.2): tipi e versioni dei testi. Il registro (public.user_consents)
// conserva, per ogni scelta, la versione del testo che la persona ha visto. Cambiare un testo vuol
// dire cambiare la sua versione: il server la imposta da qui, il client non la sceglie mai.
// Il testo dell'informativa sta in messages/*.json (namespace Consent); qui solo gli identificativi.

export const CONSENT_KINDS = ["profiling", "location", "sensitive", "newsletter", "cookies_analytics"] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number];

// Lunghezza massima 40 caratteri (vincolo user_consents_text_version_length).
export const CONSENT_TEXT_VERSIONS: Record<ConsentKind, string> = {
  profiling: "profiling-2026-10-v1",
  location: "location-2026-10-v1",
  sensitive: "sensitive-2026-10-v1",
  newsletter: "newsletter-2026-10-v1",
  cookies_analytics: "cookies-analytics-2026-10-v1",
};

// Versione assegnata ai consensi ai dati sensibili dati prima del registro (migrazione del SQL custom).
export const LEGACY_SENSITIVE_VERSION = "v0-legacy";

export function isConsentKind(value: unknown): value is ConsentKind {
  return typeof value === "string" && (CONSENT_KINDS as readonly string[]).includes(value);
}
