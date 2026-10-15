import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { CONSENT_COOKIE } from "@/lib/consent";
import { routing } from "@/lib/i18n/routing";
import { affiliateLinkSecret } from "@/server/affiliates/config";
import { ANON_COOKIE, analyticsConsentFromCookie, anonIdFor, setAnonCookie } from "@/server/affiliates/anon-cookie";
import { newSubid } from "@/server/affiliates/links";
import { allowGoClick, goRateLimitedResponse } from "@/server/affiliates/rate-limit";
import { getPartnerConfig, readyPartner } from "@/server/affiliates/partners";
import { recordVerticalClick } from "@/server/affiliates/vertical-click";
import {
  buildVerticalUrl,
  checkVerticalLink,
  parseVerticalLinkQuery,
  type Vertical,
} from "@/server/affiliates/vertical-links";
import { getUser } from "@/server/auth";

// Uscita verso alloggi e noleggi (passo 3.1). Il link è firmato dal server (verticalLinkHref):
// la route verifica il rate limit, firma e scadenza, legge il template del partner dal database,
// costruisce l'URL con il subid di questo click, registra il click e risponde 302. Nessun
// parametro della richiesta diventa host o percorso. Se la verticale non è pronta o il click non
// si registra, si torna alla pagina della verticale con avviso (303), mai verso un URL non costruito qui.

const NO_STORE = { "Cache-Control": "no-store" };

const FALLBACK_PAGE: Record<Vertical, string> = {
  lodging: "dove-dormire",
  car: "noleggio-auto",
};

function invalid(error: "invalid_signature" | "invalid_params") {
  return NextResponse.json({ error }, { status: 400, headers: NO_STORE });
}

// Pagina di ripiego per il rate limit. La verticale è quella grezza della richiesta, non ancora
// verificata: serve solo a tornare alla pagina giusta, e la firma si controlla dopo.
function rateLimitFallback(locale: string, rawVertical: string | null): string {
  if (rawVertical === "lodging" || rawVertical === "car") return `/${locale}/${FALLBACK_PAGE[rawVertical]}`;
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
  if (checkVerticalLink(link, parsed.signature, affiliateLinkSecret()) !== "ok") return invalid("invalid_signature");

  const cookieValue = request.cookies.get(ANON_COOKIE)?.value;
  const anonId = anonIdFor(cookieValue, analyticsConsentFromCookie(request.cookies.get(CONSENT_COOKIE)?.value));
  const unavailable = () => {
    const response = NextResponse.redirect(
      new URL(`/${locale}/${FALLBACK_PAGE[link.vertical]}?avviso=non-disponibile`, origin),
      303,
    );
    response.headers.set("Cache-Control", "no-store");
    setAnonCookie(response, anonId, cookieValue);
    return response;
  };

  const ready = readyPartner(await getPartnerConfig(link.partner), link.vertical);
  if (!ready) return unavailable();

  const subId = newSubid();
  const target = buildVerticalUrl(ready.config, {
    query: link.query,
    airport: link.airport,
    checkin: link.checkin,
    checkout: link.checkout,
    adults: String(link.adults),
    partner_id: ready.partnerId,
    subid: subId,
    locale,
  });
  if (target === null) return unavailable();

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
  if (!recorded) return unavailable();

  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "no-store");
  setAnonCookie(response, anonId, cookieValue);
  return response;
}
