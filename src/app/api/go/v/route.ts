import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { CONSENT_COOKIE } from "@/lib/consent";
import { routing } from "@/lib/i18n/routing";
import { affiliateLinkSecret } from "@/server/affiliates/config";
import { ANON_COOKIE, analyticsConsentFromCookie, anonIdFor, setAnonCookie } from "@/server/affiliates/anon-cookie";
import { newSubid } from "@/server/affiliates/links";
import { allowGoClick, goRateLimitedResponse } from "@/server/affiliates/rate-limit";
import { getPartnerConfig, readyPartner } from "@/server/affiliates/partners";
import { catalogPlaceName } from "@/server/affiliates/vertical-places";
import { recordVerticalClick } from "@/server/affiliates/vertical-click";
import {
  checkVerticalLink,
  destinationFor,
  isVertical,
  parseVerticalLinkQuery,
  usesPlace,
  VERTICAL_PAGE,
  type Vertical,
} from "@/server/affiliates/vertical-links";
import { pageFor } from "@/server/affiliates/vertical-pages";
import { getUser } from "@/server/auth";

// Uscita verso le verticali affiliate (passi 3.1 e 3.2). Il link è firmato dal server (verticalLinkHref):
// la route verifica il rate limit, firma e scadenza, legge il template del partner dal database,
// risolve il nome del luogo nel catalogo, costruisce l'URL con il subid di questo click, registra il
// click e risponde 302. Nessun parametro della richiesta diventa host o percorso. Se la verticale non
// è pronta o il click non si registra, si torna alla pagina della verticale con avviso (303), mai
// verso un URL non costruito qui.

const NO_STORE = { "Cache-Control": "no-store" };

function invalid(error: "invalid_signature" | "invalid_params") {
  return NextResponse.json({ error }, { status: 400, headers: NO_STORE });
}

// Pagina di ripiego per il rate limit. La verticale è quella grezza della richiesta, non ancora
// verificata: serve solo a tornare alla pagina giusta, e la firma si controlla dopo.
function rateLimitFallback(locale: string, rawVertical: string | null): string {
  if (rawVertical !== null && isVertical(rawVertical)) return `/${locale}/${VERTICAL_PAGE[rawVertical]}`;
  return `/${locale}`;
}

export async function GET(request: NextRequest) {
  const user = await getUser();
  const { searchParams, origin } = request.nextUrl;
  const lang = searchParams.get("l");
  const locale = hasLocale(routing.locales, lang) ? lang : routing.defaultLocale;
  if (!(await allowGoClick(request, user))) {
    return goRateLimitedResponse(origin, rateLimitFallback(locale, searchParams.get("vertical")));
  }

  const parsed = parseVerticalLinkQuery(searchParams);
  if (!parsed) return invalid("invalid_params");
  const { link } = parsed;
  // Lingua firmata nel link: la pagina di ripiego e il luogo usano questa, non il parametro grezzo.
  const signedLocale = link.locale;
  if (checkVerticalLink(link, parsed.signature, affiliateLinkSecret()) !== "ok") return invalid("invalid_signature");

  const cookieValue = request.cookies.get(ANON_COOKIE)?.value;
  const anonId = anonIdFor(cookieValue, analyticsConsentFromCookie(request.cookies.get(CONSENT_COOKIE)?.value));
  const unavailable = (vertical: Vertical) => {
    const response = NextResponse.redirect(
      new URL(`/${signedLocale}/${VERTICAL_PAGE[vertical]}?avviso=non-disponibile`, origin),
      303,
    );
    response.headers.set("Cache-Control", "no-store");
    setAnonCookie(response, anonId, cookieValue);
    return response;
  };

  const ready = readyPartner(await getPartnerConfig(link.partner), link.vertical);
  if (!ready) return unavailable(link.vertical);

  // Il luogo è uno slug firmato: il nome si prende dal catalogo, mai dal client.
  let placeName: string | null = null;
  if (usesPlace(link.vertical)) {
    placeName = await catalogPlaceName(link.place, signedLocale, link.vertical === "lodging");
    if (placeName === null) return unavailable(link.vertical);
  }

  const subId = newSubid();
  // Stessa destinazione che la pagina ha mostrato (destinationFor): il click non cambia la pagina verificata.
  const destination = destinationFor(link, ready.config, {
    placeName,
    partnerId: ready.partnerId,
    subid: subId,
    locale: signedLocale,
    page: pageFor(link),
  });
  if (destination === null) return unavailable(link.vertical);
  const target = destination.url;

  const recorded = await recordVerticalClick({
    user,
    partner: link.partner,
    vertical: link.vertical,
    subId,
    context: link.context,
    targetUrl: target,
    anonId,
    itineraryId: link.itineraryId,
  });
  if (!recorded) return unavailable(link.vertical);

  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "no-store");
  setAnonCookie(response, anonId, cookieValue);
  return response;
}
