import { hasLocale } from "next-intl";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/lib/i18n/routing";
import { safeNextPath } from "@/server/auth/redirect";
import { createClient } from "@/server/supabase/server";

// Destinazione di magic link e OAuth: scambia il codice PKCE con la sessione.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), `/${routing.defaultLocale}`);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  const segment = next.split("/")[1];
  const locale = hasLocale(routing.locales, segment) ? segment : routing.defaultLocale;
  return NextResponse.redirect(new URL(`/${locale}/login?error=callback`, origin));
}
