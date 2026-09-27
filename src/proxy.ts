import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/lib/i18n/routing";
import { updateSession } from "@/server/supabase/session";

const intl = createIntlMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = intl(request);
  return updateSession(request, response);
}

export const config = {
  // Esclude API, file interni di Next e file statici (con estensione).
  matcher: ["/((?!api|_next|_vercel|.*\..*).*)"],
};
