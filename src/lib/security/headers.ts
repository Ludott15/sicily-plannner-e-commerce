// Header di sicurezza delle pagine (passo 11.5). Funzioni pure: nessun accesso all'ambiente, così
// si testano senza server. src/proxy.ts legge l'ambiente e le passa qui.

export type SecurityHeaderOptions = {
  // Nonce casuale per questa richiesta (base64): Next lo applica a script e stili che genera.
  nonce: string;
  // Sviluppo: serve 'unsafe-eval' (React ricostruisce gli stack) e le connessioni HMR via ws.
  isDev: boolean;
  // Produzione su Vercel: solo qui si mette HSTS e si promuovono le richieste http a https.
  isProduction: boolean;
  // Origine di Supabase (NEXT_PUBLIC_SUPABASE_URL): auth, realtime, storage.
  supabaseUrl: string;
  // DSN di Sentry, se configurato: il browser invia gli eventi solo a quell'host.
  sentryDsn?: string | undefined;
  // Origini dei tile e dello stile della mappa (MapLibre, src/components/design/map/map-style.ts).
  mapOrigins?: readonly string[];
};

export const MAP_TILE_ORIGIN = "https://tiles.openfreemap.org";
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
// Avatar dei fornitori OAuth attivi (Google, supabase/config.toml): profiles.avatar_url.
export const AVATAR_ORIGIN = "https://lh3.googleusercontent.com";

// Origine (scheme + host) di un URL. Un valore non valido non produce nulla.
export function originOf(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.origin === "null" ? null : url.origin;
  } catch {
    return null;
  }
}

// Il DSN di Sentry è https://<chiave>@<host>/<progetto>: l'eventuale invio passa solo da <host>.
export function sentryIngestOrigin(dsn: string | undefined): string | null {
  return originOf(dsn?.trim() || undefined);
}

// Le connessioni WebSocket (realtime Supabase) usano lo stesso host in wss.
function wsOf(origin: string): string {
  return origin.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

export function buildContentSecurityPolicy(options: SecurityHeaderOptions): string {
  const supabase = originOf(options.supabaseUrl);
  const sentry = sentryIngestOrigin(options.sentryDsn);
  const maps = options.mapOrigins ?? [MAP_TILE_ORIGIN];

  const scriptSrc = ["'self'", `'nonce-${options.nonce}'`, "'strict-dynamic'", TURNSTILE_ORIGIN];
  if (options.isDev) scriptSrc.push("'unsafe-eval'");

  const connectSrc = ["'self'", TURNSTILE_ORIGIN, ...maps];
  if (supabase) connectSrc.push(supabase, wsOf(supabase));
  if (sentry) connectSrc.push(sentry);
  if (options.isDev) connectSrc.push("ws:", "wss:");

  const imgSrc = ["'self'", "blob:", "data:", AVATAR_ORIGIN];
  if (supabase) imgSrc.push(supabase);

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    // Lo stile di React è un attributo style="" nel markup: serve style-src-attr, non il nonce.
    ["style-src", ["'self'", `'nonce-${options.nonce}'`]],
    ["style-src-attr", ["'unsafe-inline'"]],
    ["img-src", imgSrc],
    ["font-src", ["'self'"]],
    ["connect-src", connectSrc],
    // Service worker e worker di MapLibre (blob:).
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["frame-src", [TURNSTILE_ORIGIN]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  // In sviluppo gli strumenti di Next (DevTools) inseriscono <style> senza nonce: solo qui si ammettono.
  if (options.isDev) directives.push(["style-src-elem", ["'self'", "'unsafe-inline'"]]);
  if (options.isProduction) directives.push(["upgrade-insecure-requests", []]);

  return directives.map(([name, values]) => [name, ...values].join(" ")).join("; ");
}

// Permissions-Policy: la geolocalizzazione serve al viaggio (solo nel sito stesso); il resto è spento.
export const PERMISSIONS_POLICY = "geolocation=(self), camera=(), microphone=(), payment=(), usb=()";

export const HSTS_VALUE = "max-age=63072000; includeSubDomains";

// Tutti gli header di una risposta HTML, CSP compresa.
export function buildSecurityHeaders(options: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": buildContentSecurityPolicy(options),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": PERMISSIONS_POLICY,
    "X-Frame-Options": "DENY",
  };
  if (options.isProduction) headers["Strict-Transport-Security"] = HSTS_VALUE;
  return headers;
}

// Nonce per richiesta: 16 byte casuali in base64. Nuovo a ogni richiesta, mai riusato.
export function createNonce(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
