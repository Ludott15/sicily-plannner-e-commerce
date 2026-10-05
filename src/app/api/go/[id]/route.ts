import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { z } from "zod";
import { CONSENT_COOKIE, hasAnalyticsConsent, parseConsent } from "@/lib/consent";
import { routing } from "@/lib/i18n/routing";
import { resolveAffiliateClick } from "@/server/affiliates/go";
import { getUser } from "@/server/auth";

// Uscita verso un partner affiliato: [id] è un'offerta (activity_offers). Registra il click
// con subid e risponde con 302.
// Il cookie anon_id (identificativo anonimo dei visitatori senza account) si imposta e si
// legge solo con il consenso ai cookie non tecnici ("accepted", src/lib/consent.ts): senza
// consenso il click si registra comunque, con il solo subid e senza anon_id.
// Mai open redirect: la destinazione viene dal catalogo, i parametri della richiesta
// scelgono solo contesto, itinerario e lingua della pagina di ripiego.

const contextSchema = z.enum(["page", "itinerary", "chat", "flights"]).catch("page");
const ANON_COOKIE = "anon_id";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams, origin } = request.nextUrl;
  const lang = searchParams.get("l");
  const locale = hasLocale(routing.locales, lang) ? lang : routing.defaultLocale;
  const fallback = (slug: string | null) =>
    NextResponse.redirect(
      new URL(slug ? `/${locale}/attivita/${slug}?avviso=non-prenotabile` : `/${locale}/attivita`, origin),
      303,
    );

  if (!z.uuid().safeParse(id).success) return fallback(null);

  const itinerary = z.uuid().safeParse(searchParams.get("i"));
  const consented = hasAnalyticsConsent(parseConsent(request.cookies.get(CONSENT_COOKIE)?.value));
  const existingAnon = consented ? request.cookies.get(ANON_COOKIE)?.value : undefined;
  const anonId = consented
    ? existingAnon && z.uuid().safeParse(existingAnon).success
      ? existingAnon
      : randomUUID()
    : null;

  const result = await resolveAffiliateClick({
    offerId: id,
    context: contextSchema.parse(searchParams.get("c")),
    itineraryId: itinerary.success ? itinerary.data : null,
    anonId,
    user: await getUser(),
  });
  if (result.kind === "unavailable") return fallback(result.slug);

  const response = NextResponse.redirect(result.url, 302);
  response.headers.set("Cache-Control", "no-store");
  if (anonId && anonId !== existingAnon) {
    response.cookies.set(ANON_COOKIE, anonId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}
