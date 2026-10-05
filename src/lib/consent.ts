// Consenso ai cookie non tecnici (banner in src/components/layout/cookie-banner.tsx).
// La scelta sta nel cookie tecnico CONSENT_COOKIE: "accepted" o "rejected"; senza scelta il
// banner compare. Nessuno script non tecnico parte senza "accepted": uno script di analisi
// futuro va caricato solo se hasAnalyticsConsent() è vero.

export const CONSENT_COOKIE = "cookie_consent";
// Sei mesi, poi il banner ricompare.
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;
export const OPEN_PREFERENCES_EVENT = "isula:cookie-preferences";

export type Consent = "accepted" | "rejected";

export function parseConsent(value: string | null | undefined): Consent | null {
  return value === "accepted" || value === "rejected" ? value : null;
}

export function hasAnalyticsConsent(consent: Consent | null): boolean {
  return consent === "accepted";
}

// Valore di document.cookie per salvare la scelta.
export function consentCookie(consent: Consent, secure: boolean): string {
  return `${CONSENT_COOKIE}=${consent}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}
