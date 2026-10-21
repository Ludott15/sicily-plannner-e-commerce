import { z } from "zod";
import { isSicilyAirport } from "@/lib/flights/airports";
import { isIsoDate } from "@/lib/flights/search-params";
import { ferryPortName, isFerryPort } from "@/lib/ferries/ports";
import { isTrainCity, trainCityName } from "@/lib/trains/cities";
import { canonicalFields, signFields, verifyFields, type SignedLinkCheck } from "./signed-links";

// Verticali affiliate (passo 3.2): alloggi, noleggi, traghetti, treni e bus, transfer, biglietti,
// barche, assicurazione, eSIM, deposito bagagli. Il link firmato va a /api/go/v con i campi della
// ricerca; la route ricalcola la firma (AFFILIATE_LINK_SECRET), legge il template del partner dal
// database e costruisce l'URL di destinazione SOLO qui: nessun parametro della richiesta diventa
// host o percorso. buildVerticalUrl è puro e testato.
//
// Regole del template (affiliate_partners.search_url_template):
//  - ogni segnaposto è {nome} e il valore è codificato con encodeURIComponent;
//  - i segnaposto stanno solo nella query; il template è https, senza frammento, senza segnaposto nel
//    percorso o nell'host, e l'host finale deve stare in allowed_hosts;
//  - un parametro il cui valore è esattamente {partner_id} o {kind} si toglie se il valore è vuoto
//    (ID partner non ancora configurato, tipo di alloggio senza filtro);
//  - con subid_param valorizzato il link deve portare il subid di questo click; con subid_param null il
//    link si costruisce senza subid nell'URL (e si toglie il parametro che porta {subid}): il click si
//    registra comunque con il suo subid in affiliate_clicks.

export const VERTICALS = [
  "lodging",
  "car",
  "ferry",
  "train",
  "transfer",
  "tickets",
  "boat",
  "insurance",
  "esim",
  "luggage",
] as const;
export type Vertical = (typeof VERTICALS)[number];

// Pagina pubblica di ogni verticale: destinazione del ripiego (avviso) e dei link di ritorno.
export const VERTICAL_PAGE: Record<Vertical, string> = {
  lodging: "dove-dormire",
  car: "noleggio-auto",
  ferry: "traghetti",
  train: "treni-e-bus",
  transfer: "transfer",
  tickets: "musei-e-biglietti",
  boat: "barche",
  insurance: "assicurazione-viaggio",
  esim: "esim",
  luggage: "deposito-bagagli",
};

export function isVertical(value: string): value is Vertical {
  return (VERTICALS as readonly string[]).includes(value);
}

export const VERTICAL_CONTEXTS = ["page", "itinerary", "chat", "flights"] as const;
export type VerticalContext = (typeof VERTICAL_CONTEXTS)[number];

// Tipi di alloggio (chiusa). Il filtro del partner passa da KIND_FILTER, mai dall'input.
export const LODGING_KINDS = ["hotel", "bnb", "ostello", "campeggio", "agriturismo", "casa_vacanze"] as const;
export type LodgingKind = (typeof LODGING_KINDS)[number];

// Campi della ricerca, nell'ordine della firma. Ogni verticale usa solo i suoi (VERTICAL_FIELDS);
// quelli che non usa devono essere vuoti (adults: 0). Così una firma non si riusa tra verticali diverse.
export const SEARCH_FIELDS = ["place", "from", "to", "date", "checkin", "checkout", "kind", "airport", "adults"] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

export const VERTICAL_FIELDS: Record<Vertical, readonly SearchField[]> = {
  lodging: ["place", "checkin", "checkout", "adults", "kind"],
  car: ["airport", "checkin", "checkout"],
  ferry: ["from", "to", "date", "adults"],
  train: ["from", "to", "date"],
  transfer: ["airport", "place", "date"],
  tickets: ["place"],
  boat: ["place", "date"],
  insurance: [],
  esim: [],
  luggage: ["place"],
};

// Partner che servono ogni verticale. Il primo è quello predefinito; gli altri sono alternative.
// Aggiungere un partner: una riga qui, una riga in affiliate_partners e una variabile in partner-env-names.
export const VERTICAL_PARTNERS: Record<Vertical, readonly string[]> = {
  lodging: ["booking", "hostelworld", "pitchup"],
  car: ["discovercars", "rentalcars"],
  ferry: ["ferryhopper", "directferries"],
  train: ["omio"],
  transfer: ["welcomepickups"],
  tickets: ["tiqets"],
  boat: ["clickandboat", "samboat"],
  insurance: ["heymondo"],
  esim: ["airalo"],
  luggage: ["radicalstorage"],
};

// Segnaposto ammessi nel search_url_template di affiliate_partners.
export const TEMPLATE_PLACEHOLDERS = [
  "place",
  "from",
  "to",
  "date",
  "checkin",
  "checkout",
  "adults",
  "kind",
  "airport",
  "partner_id",
  "subid",
  "locale",
  "page",
] as const;
export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];
export type TemplateValues = Partial<Record<TemplatePlaceholder, string>>;

// Segnaposto il cui valore vuoto toglie il parametro che lo contiene (invece di annullare il link).
const OPTIONAL_PLACEHOLDERS: readonly TemplatePlaceholder[] = ["partner_id", "kind"];

// Valore del segnaposto {kind} per partner e tipo di alloggio. Mappa chiusa lato server.
// booking: il filtro per tipo (parametro nflt, valori ht_id) non è verificato nel Partner Centre: finché
// la mappa è vuota non si applica alcun filtro e il parametro si toglie. Da compilare con i valori
// confermati (formato verificato: no).
const KIND_FILTER: Record<string, Partial<Record<LodgingKind, string>>> = {
  booking: {},
};

export function kindFilterValue(partner: string, kind: string): string {
  if (!(LODGING_KINDS as readonly string[]).includes(kind)) return "";
  return KIND_FILTER[partner]?.[kind as LodgingKind] ?? "";
}

export type PartnerTemplate = {
  searchUrlTemplate: string;
  allowedHosts: readonly string[];
  subidParam: string | null;
};

const PARTNER_KEY = /^[a-z][a-z_]{1,29}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PLACE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ADULTS = /^(0|[1-9]\d?)$/;
const MAX_ADULTS = 30;
const PLACEHOLDER = /\{([a-z_]+)\}/g;

// Pagina di ripiego: la home del partner (primo host dell'allowlist), con il subid se il partner ne usa uno.
// Nessun dato della ricerca: il link non porta la ricerca al partner.
function fallbackTarget(template: PartnerTemplate, subid: string): VerticalTarget | null {
  const host = template.allowedHosts[0];
  if (!host) return null;
  const query = template.subidParam === null ? "" : `?${template.subidParam}=${encodeURIComponent(subid)}`;
  const url = finalizeUrl(`https://${host}/${query}`, template, subid);
  return url === null ? null : { url, filled: new Set<TemplatePlaceholder>(), fallback: true };
}

// Controlli comuni a ogni destinazione: https, senza utente né porta, host in allowlist, e il parametro
// del subid (se previsto) con il subid di questo click.
function finalizeUrl(candidate: string, template: PartnerTemplate, subid: string): string | null {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return null;
  const allowed = template.allowedHosts.map((host) => host.toLowerCase());
  if (!allowed.includes(url.hostname.toLowerCase())) return null;
  if (template.subidParam !== null && url.searchParams.get(template.subidParam) !== subid) return null;
  return url.toString();
}

export type VerticalTarget = {
  url: string;
  // Segnaposto che hanno portato un valore nell'URL.
  filled: ReadonlySet<TemplatePlaceholder>;
  // true se è la home di ripiego (nessuna ricerca, nessun segnaposto).
  fallback: boolean;
};

// Segmento di pagina (chiuso lato server, vedi vertical-pages.ts): solo caratteri di URL sicuri.
const PAGE_VALUE = /^[A-Za-z0-9_\-/.%+=&,]*$/;

// URL di destinazione dal template del partner. null se: il subid manca; il template non è https, ha
// frammento o segnaposto fuori dalla query; un segnaposto è sconosciuto o senza valore (salvo quelli
// opzionali, che tolgono il parametro); l'URL ha utente o porta; l'host non è in allowlist; il parametro
// del subid (se previsto) non porta il subid di questo click.
// {page} sceglie la pagina verificata del partner; senza pagina il link va alla home di ripiego.
export function buildVerticalTarget(template: PartnerTemplate, values: TemplateValues): VerticalTarget | null {
  const subid = values.subid;
  if (!subid) return null;
  let raw = template.searchUrlTemplate;
  if (!raw.startsWith("https://") || raw.includes("#")) return null;

  if (raw.includes("{page}")) {
    if (!values.page) return fallbackTarget(template, subid);
    if (!PAGE_VALUE.test(values.page)) return null;
    raw = raw.split("{page}").join(values.page);
  }

  const queryStart = raw.indexOf("?");
  const base = queryStart === -1 ? raw : raw.slice(0, queryStart);
  if (/[{}]/.test(base)) return null;
  const queryPart = queryStart === -1 ? "" : raw.slice(queryStart + 1);

  const filled = new Set<TemplatePlaceholder>();
  // Valore di un segnaposto, o null se manca (o non è ammesso in questo template).
  const valueOf = (name: string): string | null => {
    if (!(TEMPLATE_PLACEHOLDERS as readonly string[]).includes(name)) return null;
    if (name === "subid" && template.subidParam === null) return null;
    const value = values[name as TemplatePlaceholder];
    return value ? value : null;
  };

  const pairs: string[] = [];
  if (queryPart !== "") {
    for (const segment of queryPart.split("&")) {
      const eq = segment.indexOf("=");
      if (eq <= 0) return null;
      const key = segment.slice(0, eq);
      const rawValue = segment.slice(eq + 1);
      if (/[{}]/.test(key)) return null;

      const whole = /^\{([a-z_]+)\}$/.exec(rawValue);
      if (whole) {
        const name = whole[1]!;
        if (name === "subid" && template.subidParam === null) continue;
        const value = valueOf(name);
        if (value === null) {
          if ((OPTIONAL_PLACEHOLDERS as readonly string[]).includes(name)) continue;
          return null;
        }
        filled.add(name as TemplatePlaceholder);
        pairs.push(`${key}=${encodeURIComponent(value)}`);
        continue;
      }

      // Valore misto (testo e segnaposto): tutti i segnaposto devono avere un valore.
      let complete = true;
      const used: TemplatePlaceholder[] = [];
      const filledValue = rawValue.replace(PLACEHOLDER, (_match, name: string) => {
        const value = valueOf(name);
        if (value === null) {
          complete = false;
          return "";
        }
        used.push(name as TemplatePlaceholder);
        return encodeURIComponent(value);
      });
      if (!complete) return null;
      for (const name of used) filled.add(name);
      pairs.push(`${key}=${filledValue}`);
    }
  }

  const candidate = pairs.length === 0 ? base : `${base}?${pairs.join("&")}`;
  const url = finalizeUrl(candidate, template, subid);
  return url === null ? null : { url, filled, fallback: false };
}

export function buildVerticalUrl(template: PartnerTemplate, values: TemplateValues): string | null {
  return buildVerticalTarget(template, values)?.url ?? null;
}

// Quanta ricerca arriva al partner: "full" se arrivano tutti i campi obbligatori della verticale (luogo
// incluso), "place" se arriva almeno il luogo, la tratta o l'aeroporto, "none" se arriva solo la home.
export type PassesSearch = "full" | "place" | "none";

const PLACEHOLDER_FIELD: Partial<Record<TemplatePlaceholder, SearchField>> = {
  place: "place",
  from: "from",
  to: "to",
  date: "date",
  checkin: "checkin",
  checkout: "checkout",
  adults: "adults",
  airport: "airport",
};
const LOCATION_FIELDS: readonly SearchField[] = ["place", "from", "to", "airport"];

export function passesSearchFor(
  vertical: Vertical,
  filled: ReadonlySet<TemplatePlaceholder>,
  covers: readonly SearchField[],
  fallback: boolean,
): PassesSearch {
  if (fallback) return "none";
  const required = VERTICAL_FIELDS[vertical].filter((field) => field !== "kind");
  if (required.length === 0) return "none";
  const covered = new Set<SearchField>(covers);
  for (const name of filled) {
    const field = PLACEHOLDER_FIELD[name];
    if (field) covered.add(field);
  }
  if (required.every((field) => covered.has(field))) return "full";
  return LOCATION_FIELDS.some((field) => usesField(vertical, field) && covered.has(field)) ? "place" : "none";
}

// Destinazione di un link validato: URL e quanta ricerca arriva. page: pagina verificata del partner
// (vertical-pages.ts) o null. I campi che la pagina copre contano solo se il template usa {page}.
export type Destination = { url: string; passesSearch: PassesSearch };
export function destinationFor(
  link: VerticalLink,
  template: PartnerTemplate,
  ids: {
    placeName: string | null;
    partnerId: string | null;
    subid: string;
    locale: string;
    page: { value: string; covers: readonly SearchField[] } | null;
  },
): Destination | null {
  const values = templateValuesFor(link, {
    placeName: ids.placeName,
    partnerId: ids.partnerId,
    subid: ids.subid,
    locale: ids.locale,
    page: ids.page?.value ?? "",
  });
  const target = buildVerticalTarget(template, values);
  if (target === null) return null;
  const pageUsed = !target.fallback && template.searchUrlTemplate.includes("{page}");
  const covers = pageUsed ? (ids.page?.covers ?? []) : [];
  return { url: target.url, passesSearch: passesSearchFor(link.vertical, target.filled, covers, target.fallback) };
}

// Campi di un link di ricerca. Un campo che la verticale non usa è "" (adults: 0).
export type VerticalLink = {
  // Chiave del partner (minuscolo); il database decide se esiste e se è attivo.
  partner: string;
  vertical: Vertical;
  // Slug del catalogo (luogo; per l'alloggio anche area). Vuoto se non usato.
  place: string;
  // Codice porto (traghetti) o stazione (treni). Vuoti se non usati.
  from: string;
  to: string;
  // YYYY-MM-DD o vuoto (data singola: traghetti, treni, transfer, barche).
  date: string;
  // Tipo di alloggio o vuoto (solo alloggi; vuoto = qualsiasi tipo).
  kind: string;
  // Aeroporto IATA siciliano (noleggi, transfer). Vuoto se non usato.
  airport: string;
  // YYYY-MM-DD o vuoti (ritiro e riconsegna, check-in e check-out).
  checkin: string;
  checkout: string;
  // Persone (1..30) per alloggi e traghetti; 0 altrove.
  adults: number;
  context: VerticalContext;
  itineraryId: string | null;
  // Scadenza in secondi Unix.
  expiresAt: number;
};

function usesField(vertical: Vertical, field: SearchField): boolean {
  return (VERTICAL_FIELDS[vertical] as readonly SearchField[]).includes(field);
}

// Verticale che usa un luogo del catalogo (il server ne risolve il nome).
export function usesPlace(vertical: Vertical): boolean {
  return usesField(vertical, "place");
}

// Campi della firma, con il prefisso "v" che li separa dagli altri link. Ogni campo ha il suo formato,
// e un campo che la verticale non usa deve essere vuoto: un link firmato per un'altra verticale non passa.
export function verticalFields(link: VerticalLink): string[] {
  if (!PARTNER_KEY.test(link.partner)) throw new Error("vertical_link: partner");
  if (!isVertical(link.vertical)) throw new Error("vertical_link: vertical");
  const v = link.vertical;

  if (usesField(v, "place")) {
    if (!PLACE_SLUG.test(link.place) || link.place.length > 80) throw new Error("vertical_link: place");
  } else if (link.place !== "") throw new Error("vertical_link: place");

  if (usesField(v, "from")) {
    if (v === "ferry" ? !isFerryPort(link.from) : !isTrainCity(link.from)) throw new Error("vertical_link: from");
    if (!usesField(v, "to")) throw new Error("vertical_link: from");
  } else if (link.from !== "") throw new Error("vertical_link: from");

  if (usesField(v, "to")) {
    if (v === "ferry" ? !isFerryPort(link.to) : !isTrainCity(link.to)) throw new Error("vertical_link: to");
    if (link.to === link.from) throw new Error("vertical_link: to");
  } else if (link.to !== "") throw new Error("vertical_link: to");

  if (usesField(v, "date")) {
    if (!isIsoDate(link.date)) throw new Error("vertical_link: date");
  } else if (link.date !== "") throw new Error("vertical_link: date");

  if (usesField(v, "checkin")) {
    if (!isIsoDate(link.checkin)) throw new Error("vertical_link: checkin");
  } else if (link.checkin !== "") throw new Error("vertical_link: checkin");
  if (usesField(v, "checkout")) {
    if (!isIsoDate(link.checkout) || link.checkout <= link.checkin) throw new Error("vertical_link: checkout");
  } else if (link.checkout !== "") throw new Error("vertical_link: checkout");

  if (usesField(v, "kind")) {
    if (link.kind !== "" && !(LODGING_KINDS as readonly string[]).includes(link.kind)) {
      throw new Error("vertical_link: kind");
    }
  } else if (link.kind !== "") throw new Error("vertical_link: kind");

  if (usesField(v, "airport")) {
    if (!isSicilyAirport(link.airport)) throw new Error("vertical_link: airport");
  } else if (link.airport !== "") throw new Error("vertical_link: airport");

  if (usesField(v, "adults")) {
    if (!Number.isInteger(link.adults) || link.adults < 1 || link.adults > MAX_ADULTS) {
      throw new Error("vertical_link: adults");
    }
  } else if (link.adults !== 0) throw new Error("vertical_link: adults");

  if (!(VERTICAL_CONTEXTS as readonly string[]).includes(link.context)) throw new Error("vertical_link: context");
  if (link.itineraryId !== null && !UUID.test(link.itineraryId)) throw new Error("vertical_link: itineraryId");
  if (!Number.isInteger(link.expiresAt) || link.expiresAt <= 0) throw new Error("vertical_link: expiresAt");

  return [
    "v",
    link.partner,
    link.vertical,
    link.place,
    link.from,
    link.to,
    link.date,
    link.kind,
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

// Valori dei segnaposto per un link già validato. placeName: nome del luogo risolto dal catalogo (solo se
// la verticale usa un luogo). page: segmento della pagina verificata (vertical-pages.ts), vuoto se non c'è.
// Nessun valore arriva dall'input libero: porti e stazioni passano dalle liste chiuse, il tipo dalla mappa.
export function templateValuesFor(
  link: VerticalLink,
  ids: { placeName: string | null; partnerId: string | null; subid: string | null; locale: string; page?: string },
): TemplateValues {
  const stationName = (code: string): string => {
    if (code === "") return "";
    if (link.vertical === "ferry" && isFerryPort(code)) return ferryPortName(code, ids.locale);
    if (link.vertical === "train" && isTrainCity(code)) return trainCityName(code, ids.locale);
    return "";
  };
  return {
    place: ids.placeName ?? "",
    from: stationName(link.from),
    to: stationName(link.to),
    date: link.date,
    checkin: link.checkin,
    checkout: link.checkout,
    adults: link.adults > 0 ? String(link.adults) : "",
    kind: link.kind === "" ? "" : kindFilterValue(link.partner, link.kind),
    airport: link.airport,
    partner_id: ids.partnerId ?? "",
    subid: ids.subid ?? "",
    locale: ids.locale,
    page: ids.page ?? "",
  };
}

const verticalQuerySchema = z.object({
  partner: z.string().regex(PARTNER_KEY),
  vertical: z.enum(VERTICALS),
  place: z.string().max(80),
  from: z.string().max(40),
  to: z.string().max(40),
  date: z.string().max(10),
  kind: z.string().max(20),
  airport: z.string().max(3),
  checkin: z.string().max(10),
  checkout: z.string().max(10),
  adults: z.string().regex(ADULTS).transform(Number),
  c: z.enum(VERTICAL_CONTEXTS),
  i: z.string().regex(UUID).or(z.literal("")),
  exp: z.string().regex(/^[1-9]\d{0,11}$/).transform(Number),
  s: z.string().min(1).max(128),
});

// Legge i parametri di /api/go/v. null se mancano o non sono nel formato; la firma e i valori per
// verticale si controllano dopo (checkVerticalLink). Parametri estranei (url, host, target) ignorati.
export function parseVerticalLinkQuery(search: URLSearchParams): { link: VerticalLink; signature: string } | null {
  const parsed = verticalQuerySchema.safeParse({
    partner: search.get("partner"),
    vertical: search.get("vertical"),
    place: search.get("place") ?? "",
    from: search.get("from") ?? "",
    to: search.get("to") ?? "",
    date: search.get("date") ?? "",
    kind: search.get("kind") ?? "",
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
      place: q.place,
      from: q.from,
      to: q.to,
      date: q.date,
      kind: q.kind,
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
    place: link.place,
    from: link.from,
    to: link.to,
    date: link.date,
    kind: link.kind,
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
