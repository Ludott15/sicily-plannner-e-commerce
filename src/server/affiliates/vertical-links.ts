import "server-only";
import { z } from "zod";
import { isSicilyAirport } from "@/lib/flights/airports";
import { isIsoDate } from "@/lib/flights/search-params";
import { canonicalFields, signFields, verifyFields, type SignedLinkCheck } from "./signed-links";

// Alloggi e noleggi (passo 3.1). Il link firmato va a /api/go/v con i parametri della ricerca;
// la route ricalcola la firma (chiave AFFILIATE_LINK_SECRET), legge il template del partner dal
// database e costruisce l'URL di destinazione SOLO qui: nessun parametro della richiesta diventa
// host o percorso. buildVerticalUrl è puro e testato: nessun link senza subid, nessun host fuori
// dall'allowlist, valori dei segnaposto codificati, solo https senza utente o porta.

export const VERTICALS = ["lodging", "car"] as const;
export type Vertical = (typeof VERTICALS)[number];

export const VERTICAL_CONTEXTS = ["page", "itinerary", "chat", "flights"] as const;
export type VerticalContext = (typeof VERTICAL_CONTEXTS)[number];

// Segnaposto ammessi nel search_url_template di affiliate_partners.
export const TEMPLATE_PLACEHOLDERS = [
  "query",
  "checkin",
  "checkout",
  "adults",
  "airport",
  "partner_id",
  "subid",
  "locale",
] as const;
export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];
export type TemplateValues = Partial<Record<TemplatePlaceholder, string>>;

export type PartnerTemplate = {
  searchUrlTemplate: string;
  allowedHosts: readonly string[];
  subidParam: string | null;
};

const PARTNER_KEY = /^[a-z][a-z_]{1,29}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Testo libero della ricerca (area, città): niente "|" né caratteri di controllo, fino a 80.
const QUERY_TEXT = /^[^|\p{Cc}]{0,80}$/u;

// URL di destinazione dal template del partner. null se: manca il subid, manca un valore usato
// dal template, il segnaposto non esiste, il template non è https, l'URL ha utente o porta,
// l'host non è nell'allowlist, o il parametro del subid non porta il subid di questo click.
export function buildVerticalUrl(template: PartnerTemplate, values: TemplateValues): string | null {
  const subid = values.subid;
  if (!subid) return null;
  if (!template.searchUrlTemplate.startsWith("https://")) return null;

  let complete = true;
  const filled = template.searchUrlTemplate.replace(/\{([a-z_]+)\}/g, (_match, name: string) => {
    const known = (TEMPLATE_PLACEHOLDERS as readonly string[]).includes(name);
    const value = known ? values[name as TemplatePlaceholder] : undefined;
    if (!value) {
      complete = false;
      return "";
    }
    return encodeURIComponent(value);
  });
  if (!complete) return null;

  let url: URL;
  try {
    url = new URL(filled);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return null;

  const allowed = template.allowedHosts.map((host) => host.toLowerCase());
  if (!allowed.includes(url.hostname.toLowerCase())) return null;

  if (template.subidParam === null || url.searchParams.get(template.subidParam) !== subid) return null;
  return url.toString();
}

export type VerticalLink = {
  // Chiave del partner (minuscolo); il database decide se esiste e se è attivo.
  partner: string;
  vertical: Vertical;
  // Area o città (alloggi). Vuoto per i noleggi.
  query: string;
  // Aeroporto IATA siciliano (noleggi). Vuoto per gli alloggi.
  airport: string;
  // YYYY-MM-DD o vuoto.
  checkin: string;
  checkout: string;
  adults: number;
  context: VerticalContext;
  itineraryId: string | null;
  // Scadenza in secondi Unix.
  expiresAt: number;
};

// Campi della firma, con il prefisso "v" che separa questi link da quelli dei voli.
export function verticalFields(link: VerticalLink): string[] {
  if (!PARTNER_KEY.test(link.partner)) throw new Error("vertical_link: partner");
  if (!(VERTICALS as readonly string[]).includes(link.vertical)) throw new Error("vertical_link: vertical");
  if (!QUERY_TEXT.test(link.query)) throw new Error("vertical_link: query");
  if (link.airport !== "" && !isSicilyAirport(link.airport)) throw new Error("vertical_link: airport");
  if (link.checkin !== "" && !isIsoDate(link.checkin)) throw new Error("vertical_link: checkin");
  if (link.checkout !== "" && !isIsoDate(link.checkout)) throw new Error("vertical_link: checkout");
  if (!Number.isInteger(link.adults) || link.adults < 1 || link.adults > 30) throw new Error("vertical_link: adults");
  if (!(VERTICAL_CONTEXTS as readonly string[]).includes(link.context)) throw new Error("vertical_link: context");
  if (link.itineraryId !== null && !UUID.test(link.itineraryId)) throw new Error("vertical_link: itineraryId");
  if (!Number.isInteger(link.expiresAt) || link.expiresAt <= 0) throw new Error("vertical_link: expiresAt");
  return [
    "v",
    link.partner,
    link.vertical,
    link.query,
    link.airport,
    link.checkin,
    link.checkout,
    String(link.adults),
    link.context,
    link.itineraryId ?? "",
    String(link.expiresAt),
  ];
}

export function canonicalVerticalLink(link: VerticalLink): string {
  return canonicalFields(verticalFields(link));
}

export function signVerticalLink(link: VerticalLink, secret: string | undefined): string {
  return signFields(verticalFields(link), secret);
}

// Controllo firma e scadenza di un link letto dalla richiesta.
export function checkVerticalLink(
  link: VerticalLink,
  signature: string,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SignedLinkCheck {
  if (!secret) return "missing_secret";
  let fields: string[];
  try {
    fields = verticalFields(link);
  } catch {
    return "invalid_signature";
  }
  return verifyFields(fields, signature, secret, link.expiresAt, nowSeconds);
}

const verticalQuerySchema = z.object({
  partner: z.string().regex(PARTNER_KEY),
  vertical: z.enum(VERTICALS),
  q: z.string().regex(QUERY_TEXT),
  airport: z.string().refine((value) => value === "" || isSicilyAirport(value)),
  checkin: z.string().refine((value) => value === "" || isIsoDate(value)),
  checkout: z.string().refine((value) => value === "" || isIsoDate(value)),
  adults: z.string().regex(/^[1-9]\d?$/).transform(Number).pipe(z.number().max(30)),
  c: z.enum(VERTICAL_CONTEXTS),
  i: z.string().regex(UUID).or(z.literal("")),
  exp: z.string().regex(/^[1-9]\d{0,11}$/).transform(Number),
  s: z.string().min(1).max(128),
});

// Legge i parametri di /api/go/v. null se mancano o non sono validi; la firma si controlla dopo.
// Parametri estranei (url, host, target) sono ignorati.
export function parseVerticalLinkQuery(search: URLSearchParams): { link: VerticalLink; signature: string } | null {
  const parsed = verticalQuerySchema.safeParse({
    partner: search.get("partner"),
    vertical: search.get("vertical"),
    q: search.get("q") ?? "",
    airport: search.get("airport") ?? "",
    checkin: search.get("checkin") ?? "",
    checkout: search.get("checkout") ?? "",
    adults: search.get("adults"),
    c: search.get("c"),
    i: search.get("i") ?? "",
    exp: search.get("exp"),
    s: search.get("s"),
  });
  if (!parsed.success) return null;
  const q = parsed.data;
  return {
    link: {
      partner: q.partner,
      vertical: q.vertical,
      query: q.q,
      airport: q.airport,
      checkin: q.checkin,
      checkout: q.checkout,
      adults: q.adults,
      context: q.c,
      itineraryId: q.i === "" ? null : q.i,
      expiresAt: q.exp,
    },
    signature: q.s,
  };
}

// Href relativo della route firmata /api/go/v, con la lingua della pagina di ripiego.
export function verticalLinkHref(link: VerticalLink, secret: string | undefined, locale: string): string {
  const query = new URLSearchParams({
    partner: link.partner,
    vertical: link.vertical,
    q: link.query,
    airport: link.airport,
    checkin: link.checkin,
    checkout: link.checkout,
    adults: String(link.adults),
    c: link.context,
    i: link.itineraryId ?? "",
    exp: String(link.expiresAt),
    s: signVerticalLink(link, secret),
    l: locale,
  });
  return `/api/go/v?${query.toString()}`;
}
