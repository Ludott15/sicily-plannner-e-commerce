import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { z } from "zod";
import { CONSENT_COOKIE } from "@/lib/consent";
import { routing } from "@/lib/i18n/routing";
import { ANON_COOKIE, analyticsConsentFromCookie, anonIdFor, setAnonCookie } from "@/server/affiliates/anon-cookie";
import { resolveAffiliateClick } from "@/server/affiliates/go";
import { allowGoClick, goRateLimitedResponse } from "@/server/affiliates/rate-limit";
import { getUser } from "@/server/auth";

// Uscita verso un partner affiliato: [id] è un'offerta (activity_offers). Registra il click
// con subid e risponde con 302. Rate limit per IP e utente (src/server/affiliates/rate-limit.ts).
// Il cookie anon_id (identificativo anonimo dei visitatori senza account) si imposta e si
// legge solo con il consenso ai cookie non tecnici ("accepted", src/lib/consent.ts): senza
// consenso il click si registra comunque, con il solo subid e senza anon_id.
// Mai open redirect: la destinazione viene dal catalogo, i parametri della richiesta
// scelgono solo contesto, itinerario e lingua della pagina di ripiego.
// La gestione di anon_id è in src/server/affiliates/anon-cookie.ts, condivisa con /api/go/flight.

const contextSchema = z.enum(["page", "itinerary", "chat", "flights"]).catch("page");

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  const { id } = await params;
  const { searchParams, origin } = request.nextUrl;
  const lang = searchParams.get("l");
  const locale = hasLocale(routing.locales, lang) ? lang : routing.defaultLocale;
  if (!(await allowGoClick(request, user))) return goRateLimitedResponse(origin, `/${locale}/attivita`);
  const fallback = (slug: string | null) =>
    NextResponse.redirect(
      new URL(slug ? `/${locale}/attivita/${slug}?avviso=non-prenotabile` : `/${locale}/attivita`, origin),
      303,
    );

  if (!z.uuid().safeParse(id).success) return fallback(null);

  const itinerary = z.uuid().safeParse(searchParams.get("i"));
  const cookieValue = request.cookies.get(ANON_COOKIE)?.value;
  const anonId = anonIdFor(cookieValue, analyticsConsentFromCookie(request.cookies.get(CONSENT_COOKIE)?.value));

  const result = await resolveAffiliateClick({
    offerId: id,
    context: contextSchema.parse(searchParams.get("c")),
    itineraryId: itinerary.success ? itinerary.data : null,
    anonId,
    user,
  });
  if (result.kind === "unavailable") return fallback(result.slug);

  const response = NextResponse.redirect(result.url, 302);
  response.headers.set("Cache-Control", "no-store");
  setAnonCookie(response, anonId, cookieValue);
  return response;
}
