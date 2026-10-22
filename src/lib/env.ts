import { z } from "zod";

// Site key di prova di Cloudflare Turnstile: il widget passa sempre, e la chiave segreta di prova
// in supabase/config.toml accetta il token. Vale in locale e in CI; in produzione (Vercel) la
// variabile è obbligatoria.
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

// Indirizzo che riceve gli avvisi dell'area ordini (fornitore in ritardo). Opzionale: senza, l'avviso resta solo
// nell'elenco admin ("fornitore in ritardo"). Solo lato server: mai con NEXT_PUBLIC_.
export function ordersAdminEmail(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const value = env.ORDERS_ADMIN_EMAIL?.trim();
  if (!value) return null;
  const parsed = z.email().safeParse(value);
  return parsed.success ? parsed.data : null;
}

// Variabili pubbliche: leggibili anche dal browser.
export const publicEnv = z
  .object({
    NEXT_PUBLIC_SITE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY:
      process.env.VERCEL_ENV === "production" ? z.string().min(1) : z.string().min(1).default(TURNSTILE_TEST_SITE_KEY),
  })
  .parse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined,
  });
