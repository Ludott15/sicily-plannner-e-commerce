import { z } from "zod";

// Site key di prova di Cloudflare Turnstile: il widget passa sempre, e la chiave segreta di prova
// in supabase/config.toml accetta il token. Vale in locale e in CI; in produzione (Vercel) la
// variabile è obbligatoria.
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

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
