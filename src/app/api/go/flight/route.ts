import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { CONSENT_COOKIE } from "@/lib/consent";
import { isSicilyAirport } from "@/lib/flights/airports";
import { AVIASALES_HOST, buildAviasalesUrl, safeMarker } from "@/lib/flights/aviasales";
import { getDeparture } from "@/lib/flights/departures";
import { routing } from "@/lib/i18n/routing";
import { ANON_COOKIE, analyticsConsentFromCookie, anonIdFor, setAnonCookie } from "@/server/affiliates/anon-cookie";
import { newSubid } from "@/server/affiliates/links";
import { getUser } from "@/server/auth";
import { recordFlightClick } from "@/server/flights/click";
import { parseFlightLinkQuery, verifyFlightLink } from "@/server/flights/links";

// Uscita verso Aviasales (passo 2.1). Il link è firmato dal server (src/server/flights/links.ts):
// la route verifica firma e scadenza, costruisce l'URL di destinazione con host fisso, registra
// il click e risponde 302. Nessun parametro della richiesta diventa URL: eventuali url, target
// o host extra vengono ignorati. Senza FLIGHT_LINK_SECRET ogni richiesta è rifiutata.

const NO_STORE = { "Cache-Control": "no-store" };

function invalid(error: "invalid_signature" | "invalid_params") {
  return NextResponse.json({ error }, { status: 400, headers: NO_STORE });
}

// Difesa in profondità: l'URL registrato deve essere https verso l'host di Aviasales.
function isAviasalesUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === AVIASALES_HOST && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  if (!searchParams.get("s")) return invalid("invalid_signature");

  const parsed = parseFlightLinkQuery(searchParams);
  if (!parsed) return invalid("invalid_params");
  if (verifyFlightLink(parsed.link, parsed.signature, process.env.FLIGHT_LINK_SECRET) !== "ok") {
    return invalid("invalid_signature");
  }

  const { link } = parsed;
  if (getDeparture(link.origin) === null || !isSicilyAirport(link.destination)) return invalid("invalid_params");

  const lang = searchParams.get("l");
  const locale = hasLocale(routing.locales, lang) ? lang : routing.defaultLocale;
  const cookieValue = request.cookies.get(ANON_COOKIE)?.value;
  const anonId = anonIdFor(cookieValue, analyticsConsentFromCookie(request.cookies.get(CONSENT_COOKIE)?.value));
  const subId = newSubid();

  // Una route pubblica non risponde mai 500: un link firmato ma non valido è un 400.
  let target: URL;
  try {
    target = buildAviasalesUrl({
      origin: link.origin,
      destination: link.destination,
      departure: link.departure,
      returnDate: link.returnDate,
      passengers: link.passengers,
      subId,
      marker: safeMarker(process.env.TRAVELPAYOUTS_MARKER),
      locale,
    });
  } catch {
    return invalid("invalid_params");
  }

  const recorded = await recordFlightClick({
    user: await getUser(),
    subId,
    context: link.context,
    targetUrl: target.toString(),
    anonId,
    itineraryId: link.itineraryId,
  });

  if (recorded === null || !isAviasalesUrl(recorded)) {
    const response = NextResponse.redirect(new URL(`/${locale}/voli?avviso=non-disponibile`, origin), 303);
    response.headers.set("Cache-Control", "no-store");
    setAnonCookie(response, anonId, cookieValue);
    return response;
  }

  const response = NextResponse.redirect(recorded, 302);
  response.headers.set("Cache-Control", "no-store");
  setAnonCookie(response, anonId, cookieValue);
  return response;
}
