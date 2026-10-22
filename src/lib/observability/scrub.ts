// Pulizia degli eventi di Sentry (passo 11.5): nessun dato personale o segreto esce dal sito.
// Funzione pura su un valore generico, così si testa senza l'SDK. Le sezioni sensibili vengono tolte
// per chiave (cookie, intestazioni di autorizzazione, corpo della richiesta, query string, utente),
// e nelle stringhe restano sostituiti gli indirizzi email, i token JWT e i valori dei parametri di codice.

export const REDACTED = "[redatto]";

// Chiavi rimosse ovunque compaiano nell'evento (a qualunque profondità).
const DROP_KEYS = new Set([
  "cookie",
  "cookies",
  "set-cookie",
  "authorization",
  "proxy-authorization",
  "x-forwarded-for",
  "x-real-ip",
  "x-api-key",
  "apikey",
  "api_key",
  "email",
  "password",
  "token",
  "access_token",
  "refresh_token",
  "provider_token",
  "secret",
  "ip_address",
  "username",
  "query_string",
  "body",
  "data",
  "request_body",
  "form_data",
]);

// Chiavi di risposta: si tengono, ma i valori di tipo stringa passano dalla redazione.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// JWT: tre segmenti base64url separati da punti, il primo è di solito "eyJ".
const JWT_RE = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
// Parametri di codice o token dentro un URL o una stringa: ?code=..., &token=..., access_token=...
const SECRET_PARAM_RE = /((?:^|[?&;\s])(?:code|token|access_token|refresh_token|otp|state|t|sig|signature)=)[^&\s#"']+/gi;
// Query string e fragment di un URL (assoluto o di percorso): via tutto dopo il "?" o il "#".
const URL_QUERY_RE = /((?:https?:\/\/[^\s"'?#]+)|(?:\/[^\s"'?#]*))[?#][^\s"']*/g;

export function redactString(value: string): string {
  return value
    .replace(EMAIL_RE, REDACTED)
    .replace(JWT_RE, REDACTED)
    .replace(SECRET_PARAM_RE, (_match, prefix: string) => `${prefix}${REDACTED}`)
    .replace(URL_QUERY_RE, "$1");
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (DROP_KEYS.has(key.toLowerCase())) continue;
      out[key] = scrubValue(child);
    }
    return out;
  }
  return value;
}

// Restituisce una copia ripulita dell'evento (l'originale non cambia). Il tipo resta quello
// dell'evento: il chiamante passa e riceve lo stesso oggetto, senza campi personali.
export function scrubSentryEvent<T>(event: T): T {
  const scrubbed = scrubValue(event) as T;
  if (scrubbed !== null && typeof scrubbed === "object" && "user" in scrubbed) {
    // L'utente non serve a diagnosticare un errore: si toglie per intero (id, email, IP).
    delete (scrubbed as Record<string, unknown>).user;
  }
  return scrubbed;
}
