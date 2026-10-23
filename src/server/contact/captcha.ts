import "server-only";

// Verifica del token Turnstile sul server per il modulo di contatto. Gli altri moduli delegano il
// controllo a Supabase Auth (captchaToken); qui non c'è una chiamata di Supabase, quindi la
// verifica va fatta direttamente con l'endpoint siteverify di Cloudflare.
// Chiave segreta: TURNSTILE_SECRET_KEY (solo server). Fuori produzione, senza la variabile, si usa
// la chiave di prova di Cloudflare (come la site key di prova in src/lib/env.ts). In produzione
// senza la variabile la verifica fallisce sempre: il modulo resta chiuso.

const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

// Un valore vuoto (o di soli spazi) vale come assente.
export function turnstileSecret(): string | null {
  const configured = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (configured) return configured;
  return process.env.VERCEL_ENV === "production" ? null : TURNSTILE_TEST_SECRET;
}

function isSuccessResponse(data: unknown): boolean {
  return typeof data === "object" && data !== null && "success" in data && data.success === true;
}

// true solo se Cloudflare conferma il token. Errori di rete, risposte non valide e
// timeout danno false: il modulo non si apre senza una verifica riuscita.
export async function verifyTurnstileToken(token: string, ip: string | null): Promise<boolean> {
  const secret = turnstileSecret();
  if (!secret) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const data: unknown = await response.json();
    return isSuccessResponse(data);
  } catch {
    return false;
  }
}
