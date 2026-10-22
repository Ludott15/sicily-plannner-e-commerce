import createIntlMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";
import { routing } from "@/lib/i18n/routing";
import { buildContentSecurityPolicy, buildSecurityHeaders, createNonce, isPrefetchRequest } from "@/lib/security/headers";
import { updateSession } from "@/server/supabase/session";

const intl = createIntlMiddleware(routing);

// Un nonce nuovo per ogni richiesta di pagina. Next legge la CSP dalla richiesta e applica il nonce
// a tutti gli script e gli stili che genera: per questo la CSP va messa anche tra le intestazioni
// della richiesta inoltrata, non solo nella risposta.
export async function proxy(request: NextRequest) {
  const nonce = createNonce(crypto.getRandomValues(new Uint8Array(16)));
  const securityOptions = {
    nonce,
    isDev: process.env.NODE_ENV === "development",
    isProduction: process.env.VERCEL_ENV === "production",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
  };

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", buildContentSecurityPolicy(securityOptions));
  const forwarded = new NextRequest(request, { headers: requestHeaders });

  const response = intl(forwarded);
  for (const [name, value] of Object.entries(buildSecurityHeaders(securityOptions))) {
    response.headers.set(name, value);
  }
  // Un prefetch non è una navigazione: il rinnovo del token si fa alla navigazione vera.
  if (isPrefetchRequest(request.headers)) return response;
  return updateSession(forwarded, response);
}

export const config = {
  // Esclude API, file interni di Next e file statici (con estensione).
  // Il punto dell'estensione va raddoppiato nella stringa ("\\."): con un solo "\" JavaScript lo
  // riduce a "." e l'esclusione copre quasi ogni percorso, così il proxy girava solo sulla home.
  matcher: ["/((?!api(?:/|$)|_next|_vercel|.*\\..*).*)"],
};
