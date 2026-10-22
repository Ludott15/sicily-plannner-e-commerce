import { describe, expect, it } from "vitest";
import {
  buildVerticalUrl,
  checkVerticalLink,
  kindFilterValue,
  parseVerticalLinkQuery,
  templateValuesFor,
  VERTICAL_FIELDS,
  VERTICAL_PAGE,
  VERTICALS,
  verticalFields,
  verticalLinkHref,
  type PartnerTemplate,
  type TemplateValues,
  type VerticalLink,
} from "./vertical-links";

const SECRET = "test-secret-do-not-use-in-prod";
const NOW = 1_800_000_000;
const ITINERARY = "0f1e2d3c-4b5a-4968-8777-665544332211";
const SUBID = "abcdef0123456789";

const BOOKING: PartnerTemplate = {
  searchUrlTemplate:
    "https://www.booking.com/searchresults.html?ss={place}&checkin={checkin}&checkout={checkout}&group_adults={adults}&aid={partner_id}&label={subid}&lang={locale}&nflt={kind}",
  allowedHosts: ["www.booking.com"],
  subidParam: "label",
};

// Valori completi per il template di Booking, senza ID partner e senza filtro di tipo.
const VALUES: TemplateValues = {
  place: "Taormina",
  checkin: "2026-11-03",
  checkout: "2026-11-05",
  adults: "2",
  partner_id: "12345",
  locale: "it",
  kind: "",
};

const LODGING: VerticalLink = {
  partner: "booking",
  vertical: "lodging",
  place: "taormina",
  from: "",
  to: "",
  date: "",
  kind: "",
  airport: "",
  checkin: "2026-11-03",
  checkout: "2026-11-05",
  adults: 2,
  context: "itinerary",
  locale: "it",
  itineraryId: ITINERARY,
  expiresAt: NOW + 3600,
};

// Un link valido per ogni verticale (campi usati e vuoti come da VERTICAL_FIELDS).
const VALID_LINKS: Record<string, VerticalLink> = {
  lodging: LODGING,
  car: { ...LODGING, partner: "discovercars", vertical: "car", place: "", checkin: "2026-11-03", checkout: "2026-11-05", airport: "PMO", adults: 0, itineraryId: null },
  ferry: { ...LODGING, partner: "ferryhopper", vertical: "ferry", place: "", from: "milazzo", to: "napoli", date: "2026-11-03", checkin: "", checkout: "", adults: 2, itineraryId: null },
  train: { ...LODGING, partner: "omio", vertical: "train", place: "", from: "palermo", to: "roma", date: "2026-11-03", checkin: "", checkout: "", adults: 0, itineraryId: null },
  transfer: { ...LODGING, partner: "welcomepickups", vertical: "transfer", place: "taormina", airport: "CTA", date: "2026-11-03", checkin: "", checkout: "", adults: 0, itineraryId: null },
  tickets: { ...LODGING, partner: "tiqets", vertical: "tickets", place: "taormina", checkin: "", checkout: "", adults: 0, itineraryId: null },
  boat: { ...LODGING, partner: "clickandboat", vertical: "boat", place: "taormina", date: "2026-11-03", checkin: "", checkout: "", adults: 0, itineraryId: null },
  insurance: { ...LODGING, partner: "heymondo", vertical: "insurance", place: "", checkin: "", checkout: "", adults: 0, itineraryId: null },
  esim: { ...LODGING, partner: "airalo", vertical: "esim", place: "", checkin: "", checkout: "", adults: 0, itineraryId: null },
  luggage: { ...LODGING, partner: "radicalstorage", vertical: "luggage", place: "taormina", checkin: "", checkout: "", adults: 0, itineraryId: null },
};

function parsedOf(link: VerticalLink) {
  return parseVerticalLinkQuery(new URL(verticalLinkHref(link, SECRET), "https://app.example").searchParams);
}

describe("buildVerticalUrl", () => {
  it("costruisce l'URL con il subid nel parametro del partner, l'ID e il filtro del tipo se presenti", () => {
    const out = buildVerticalUrl(BOOKING, { ...VALUES, subid: SUBID });
    expect(out).not.toBeNull();
    const url = new URL(out!);
    expect(url.origin).toBe("https://www.booking.com");
    expect(url.searchParams.get("label")).toBe(SUBID);
    expect(url.searchParams.get("aid")).toBe("12345");
    expect(url.searchParams.get("group_adults")).toBe("2");
    expect(url.searchParams.get("ss")).toBe("Taormina");
    expect(url.searchParams.has("nflt")).toBe(false);

    const filtered = buildVerticalUrl(BOOKING, { ...VALUES, kind: "ht_id=204", subid: SUBID });
    expect(new URL(filtered!).searchParams.get("nflt")).toBe("ht_id=204");
  });

  it("senza ID del partner il parametro d'affiliazione si toglie e il link resta valido", () => {
    const out = buildVerticalUrl(BOOKING, { ...VALUES, partner_id: "", subid: SUBID });
    expect(out).not.toBeNull();
    const url = new URL(out!);
    expect(url.searchParams.has("aid")).toBe(false);
    expect(url.searchParams.get("label")).toBe(SUBID);
    expect(url.hostname).toBe("www.booking.com");
  });

  it("subid_param null: il link esce senza subid nell'URL, anche se il template lo porta", () => {
    const noParam: PartnerTemplate = { ...BOOKING, subidParam: null };
    const out = buildVerticalUrl(noParam, { ...VALUES, subid: SUBID });
    expect(out).not.toBeNull();
    expect(out).not.toContain(SUBID);
    expect(new URL(out!).searchParams.has("label")).toBe(false);
    expect(new URL(out!).hostname).toBe("www.booking.com");
  });

  it("subid_param null con {subid} dentro un valore misto: nessun link (il subid non va nell'URL)", () => {
    const mixed: PartnerTemplate = {
      ...BOOKING,
      subidParam: null,
      searchUrlTemplate: "https://www.booking.com/searchresults.html?ss={place}&ref=x-{subid}",
    };
    expect(buildVerticalUrl(mixed, { ...VALUES, subid: SUBID })).toBeNull();
  });

  it("nessun link senza subid", () => {
    expect(buildVerticalUrl(BOOKING, VALUES)).toBeNull();
    expect(buildVerticalUrl(BOOKING, { ...VALUES, subid: "" })).toBeNull();
  });

  it("subid_param valorizzato: nessun link se il template non porta il subid del click", () => {
    const withoutSubid: PartnerTemplate = { ...BOOKING, searchUrlTemplate: BOOKING.searchUrlTemplate.replace("&label={subid}", "") };
    expect(buildVerticalUrl(withoutSubid, { ...VALUES, subid: SUBID })).toBeNull();
  });

  it("host fuori dall'allowlist: nessun link, anche con nomi che lo imitano", () => {
    const evil = (url: string): PartnerTemplate => ({ ...BOOKING, searchUrlTemplate: url });
    const values = { ...VALUES, subid: SUBID };
    expect(buildVerticalUrl(evil("https://evil.example/s?label={subid}"), values)).toBeNull();
    expect(buildVerticalUrl(evil("https://www.booking.com.evil.example/s?label={subid}"), values)).toBeNull();
    expect(buildVerticalUrl(evil("https://www.booking.com@evil.example/s?label={subid}"), values)).toBeNull();
    expect(buildVerticalUrl(evil("https://evil.example\\@www.booking.com/s?label={subid}"), values)).toBeNull();
    expect(buildVerticalUrl(evil("https://user:pw@www.booking.com/s?label={subid}"), values)).toBeNull();
    expect(buildVerticalUrl(evil("https://www.booking.com:8443/s?label={subid}"), values)).toBeNull();
  });

  it("host ricavato da un segnaposto (percorso o host) non passa mai", () => {
    const values = { ...VALUES, subid: SUBID, place: "evil.example" };
    expect(buildVerticalUrl({ ...BOOKING, searchUrlTemplate: "https://{place}/s?label={subid}" }, values)).toBeNull();
    expect(buildVerticalUrl({ ...BOOKING, searchUrlTemplate: "https://www.booking.com/{place}?label={subid}" }, values)).toBeNull();
  });

  it("solo https, senza frammento: http, schema mancante e frammento non passano", () => {
    const values = { ...VALUES, subid: SUBID };
    expect(buildVerticalUrl({ ...BOOKING, searchUrlTemplate: BOOKING.searchUrlTemplate.replace("https", "http") }, values)).toBeNull();
    expect(buildVerticalUrl({ ...BOOKING, searchUrlTemplate: "//www.booking.com/s?label={subid}" }, values)).toBeNull();
    expect(buildVerticalUrl({ ...BOOKING, searchUrlTemplate: `${BOOKING.searchUrlTemplate}#x` }, values)).toBeNull();
  });

  it("segnaposto codificati: un valore con caratteri speciali non cambia struttura né host", () => {
    const raw = "Giardini & Naxos?#/x=y";
    const out = buildVerticalUrl(BOOKING, { ...VALUES, place: raw, subid: SUBID });
    expect(out).not.toBeNull();
    const url = new URL(out!);
    expect(url.searchParams.get("ss")).toBe(raw);
    expect(url.hash).toBe("");
    expect(url.hostname).toBe("www.booking.com");
    expect(out).toContain("ss=Giardini%20%26%20Naxos%3F%23%2Fx%3Dy");
  });

  it("valore mancante per un segnaposto obbligatorio: nessun link", () => {
    expect(buildVerticalUrl(BOOKING, { ...VALUES, place: "", subid: SUBID })).toBeNull();
    expect(buildVerticalUrl(BOOKING, { ...VALUES, checkin: undefined, subid: SUBID })).toBeNull();
  });

  it("segnaposto sconosciuto nel template: nessun link", () => {
    const unknown: PartnerTemplate = { ...BOOKING, searchUrlTemplate: `${BOOKING.searchUrlTemplate}&x={password}` };
    expect(buildVerticalUrl(unknown, { ...VALUES, subid: SUBID })).toBeNull();
  });

  it("l'allowlist non distingue le maiuscole", () => {
    const upper: PartnerTemplate = { ...BOOKING, allowedHosts: ["WWW.Booking.com"] };
    expect(buildVerticalUrl(upper, { ...VALUES, subid: SUBID })).not.toBeNull();
  });

  it("un template senza segnaposto (home del partner) produce la home con il subid se previsto", () => {
    const home: PartnerTemplate = { searchUrlTemplate: "https://www.omio.com/", allowedHosts: ["www.omio.com"], subidParam: null };
    expect(buildVerticalUrl(home, { subid: SUBID })).toBe("https://www.omio.com/");
  });
});

describe("valori dei segnaposto", () => {
  it("porti e stazioni passano per il nome dalle liste chiuse; date e aeroporto come sono", () => {
    const values = templateValuesFor(VALID_LINKS.ferry!, { placeName: null, partnerId: null, subid: SUBID, locale: "it" });
    expect(values.from).toBe("Milazzo");
    expect(values.to).toBe("Napoli");
    expect(values.date).toBe("2026-11-03");
    expect(values.adults).toBe("2");
    expect(values.partner_id).toBe("");
    const en = templateValuesFor(VALID_LINKS.train!, { placeName: null, partnerId: "X1", subid: SUBID, locale: "en" });
    expect(en.from).toBe("Palermo");
    expect(en.to).toBe("Rome");
    expect(en.partner_id).toBe("X1");
  });

  it("il tipo di alloggio passa dalla mappa chiusa: senza valore mappato il segnaposto è vuoto", () => {
    expect(kindFilterValue("booking", "hotel")).toBe("");
    expect(kindFilterValue("booking", "yacht")).toBe("");
    expect(kindFilterValue("hostelworld", "ostello")).toBe("");
    const values = templateValuesFor({ ...LODGING, kind: "bnb" }, { placeName: "Taormina", partnerId: null, subid: SUBID, locale: "it" });
    expect(values.kind).toBe("");
    expect(values.place).toBe("Taormina");
  });

  it("un template con ferry: from e to arrivano come nomi codificati", () => {
    const ferryTemplate: PartnerTemplate = {
      searchUrlTemplate: "https://www.ferryhopper.com/search?from={from}&to={to}&date={date}&subid={subid}",
      allowedHosts: ["www.ferryhopper.com"],
      subidParam: "subid",
    };
    const values = templateValuesFor(VALID_LINKS.ferry!, { placeName: null, partnerId: null, subid: SUBID, locale: "it" });
    const out = new URL(buildVerticalUrl(ferryTemplate, values)!);
    expect(out.searchParams.get("from")).toBe("Milazzo");
    expect(out.searchParams.get("to")).toBe("Napoli");
    expect(out.searchParams.get("subid")).toBe(SUBID);
  });
});

describe("campi per verticale", () => {
  it("ogni verticale ha un link valido, una pagina e campi definiti", () => {
    expect(Object.keys(VERTICAL_FIELDS).sort()).toEqual([...VERTICALS].sort());
    expect(Object.keys(VERTICAL_PAGE).sort()).toEqual([...VERTICALS].sort());
    for (const vertical of VERTICALS) {
      expect(() => verticalFields(VALID_LINKS[vertical]!)).not.toThrow();
    }
  });

  it("valori fuori dalle liste chiuse: porto, stazione, tipo di alloggio, aeroporto", () => {
    expect(() => verticalFields({ ...VALID_LINKS.ferry!, from: "atlantide" })).toThrow("vertical_link: from");
    expect(() => verticalFields({ ...VALID_LINKS.ferry!, to: "stromboli" })).toThrow("vertical_link: to");
    expect(() => verticalFields({ ...VALID_LINKS.train!, to: "stazione-inventata" })).toThrow("vertical_link: to");
    expect(() => verticalFields({ ...LODGING, kind: "yacht" })).toThrow("vertical_link: kind");
    expect(() => verticalFields({ ...VALID_LINKS.car!, kind: "hotel" })).toThrow("vertical_link: kind");
    expect(() => verticalFields({ ...VALID_LINKS.car!, airport: "FCO" })).toThrow("vertical_link: airport");
    expect(() => verticalFields({ ...VALID_LINKS.transfer!, airport: "NAP" })).toThrow("vertical_link: airport");
  });

  it("stesso porto in partenza e arrivo: rifiutato", () => {
    expect(() => verticalFields({ ...VALID_LINKS.ferry!, to: "milazzo" })).toThrow("vertical_link: to");
    expect(() => verticalFields({ ...VALID_LINKS.train!, to: "palermo" })).toThrow("vertical_link: to");
  });

  it("slug del luogo e testo libero: solo slug del catalogo", () => {
    expect(() => verticalFields({ ...LODGING, place: "Taormina" })).toThrow("vertical_link: place");
    expect(() => verticalFields({ ...LODGING, place: "a|b" })).toThrow("vertical_link: place");
    expect(() => verticalFields({ ...LODGING, place: "x".repeat(81) })).toThrow("vertical_link: place");
    expect(() => verticalFields({ ...LODGING, place: "" })).toThrow("vertical_link: place");
  });

  it("date: formato reale e ordine di ritiro e riconsegna", () => {
    expect(() => verticalFields({ ...LODGING, checkin: "2026-02-30" })).toThrow("vertical_link: checkin");
    expect(() => verticalFields({ ...LODGING, checkout: "2026-11-03" })).toThrow("vertical_link: checkout");
    expect(() => verticalFields({ ...VALID_LINKS.ferry!, date: "03/11/2026" })).toThrow("vertical_link: date");
  });

  it("persone: 1..30 dove servono; 0 altrove", () => {
    expect(() => verticalFields({ ...LODGING, adults: 0 })).toThrow("vertical_link: adults");
    expect(() => verticalFields({ ...LODGING, adults: 31 })).toThrow("vertical_link: adults");
    expect(() => verticalFields({ ...VALID_LINKS.car!, adults: 2 })).toThrow("vertical_link: adults");
  });

  it("un campo che la verticale non usa non si riempie: nessuna firma riutilizzabile tra verticali", () => {
    expect(() => verticalFields({ ...VALID_LINKS.insurance!, place: "taormina" })).toThrow("vertical_link: place");
    expect(() => verticalFields({ ...VALID_LINKS.esim!, airport: "PMO" })).toThrow("vertical_link: airport");
    expect(() => verticalFields({ ...VALID_LINKS.car!, place: "taormina" })).toThrow("vertical_link: place");
    expect(() => verticalFields({ ...VALID_LINKS.tickets!, date: "2026-11-03" })).toThrow("vertical_link: date");
  });

  it("partner con caratteri non ammessi o verticale fuori elenco", () => {
    expect(() => verticalFields({ ...LODGING, partner: "Booking" })).toThrow("vertical_link: partner");
    expect(() => verticalFields({ ...LODGING, vertical: "flight" as VerticalLink["vertical"] })).toThrow("vertical_link: vertical");
  });
});

describe("firma dei link delle verticali", () => {
  it.each(VERTICALS)("un link di %s si rilegge uguale e la firma è valida", (vertical) => {
    const link = VALID_LINKS[vertical]!;
    const parsed = parsedOf(link);
    expect(parsed?.link).toEqual(link);
    expect(checkVerticalLink(parsed!.link, parsed!.signature, SECRET, NOW)).toBe("ok");
  });

  it("firma alterata: luogo, verticale o partner cambiati", () => {
    const parsed = parsedOf(LODGING);
    expect(checkVerticalLink({ ...parsed!.link, place: "palermo" }, parsed!.signature, SECRET, NOW)).toBe("invalid_signature");
    expect(checkVerticalLink({ ...parsed!.link, partner: "evil" }, parsed!.signature, SECRET, NOW)).toBe("invalid_signature");
    expect(checkVerticalLink({ ...parsed!.link, vertical: "car" }, parsed!.signature, SECRET, NOW)).toBe("invalid_signature");
  });

  it("una firma di alloggio non vale per un'altra verticale con gli stessi campi", () => {
    const parsed = parsedOf(LODGING);
    const asFerry = { ...parsed!.link, vertical: "ferry" as const };
    expect(checkVerticalLink(asFerry, parsed!.signature, SECRET, NOW)).toBe("invalid_signature");
  });

  it("scaduto: expired; chiave assente: missing_secret", () => {
    const expired = { ...LODGING, expiresAt: NOW };
    const signature = verticalLinkHref(expired, SECRET).split("&s=")[1]!.split("&")[0]!;
    expect(checkVerticalLink(expired, signature, SECRET, NOW)).toBe("expired");
    expect(checkVerticalLink(LODGING, signature, undefined, NOW)).toBe("missing_secret");
    expect(() => verticalLinkHref(LODGING, undefined)).toThrow();
  });

  it("valori fuori formato: la firma non si controlla nemmeno (invalid_signature)", () => {
    const signature = "x".repeat(43);
    expect(checkVerticalLink({ ...LODGING, checkout: "2026-11-03" }, signature, SECRET, NOW)).toBe("invalid_signature");
    expect(checkVerticalLink({ ...LODGING, place: "a|b" }, signature, SECRET, NOW)).toBe("invalid_signature");
    expect(checkVerticalLink({ ...VALID_LINKS.ferry!, from: "atlantide" }, signature, SECRET, NOW)).toBe("invalid_signature");
  });

  it("parametri mancanti o malformati: null; parametri estranei ignorati", () => {
    const base = new URL(verticalLinkHref(LODGING, SECRET), "https://app.example").searchParams;
    const without = (key: string) => {
      const copy = new URLSearchParams(base);
      copy.delete(key);
      return copy;
    };
    expect(parseVerticalLinkQuery(without("partner"))).toBeNull();
    expect(parseVerticalLinkQuery(without("s"))).toBeNull();
    expect(parseVerticalLinkQuery(without("l"))).toBeNull();
    expect(parseVerticalLinkQuery(without("adults"))).toBeNull();
    const badVertical = new URLSearchParams(base);
    badVertical.set("vertical", "flight");
    expect(parseVerticalLinkQuery(badVertical)).toBeNull();
    const extra = new URLSearchParams(base);
    extra.set("url", "https://evil.example");
    extra.set("host", "evil.example");
    extra.set("target", "https://evil.example");
    expect(parseVerticalLinkQuery(extra)?.link).toEqual(LODGING);
  });
});

describe("lingua firmata", () => {
  it("il locale è nella firma: cambiarlo rende il link non valido", () => {
    const parsed = parsedOf(LODGING);
    expect(checkVerticalLink({ ...parsed!.link, locale: "en" }, parsed!.signature, SECRET, NOW)).toBe("invalid_signature");
  });

  it("una lingua fuori dall'elenco (it, en) non si firma", () => {
    expect(() => verticalFields({ ...LODGING, locale: "fr" as VerticalLink["locale"] })).toThrow("vertical_link: locale");
  });

  it("un link con l=en si rilegge con la lingua en", () => {
    const link = { ...LODGING, locale: "en" as const };
    expect(parsedOf(link)?.link.locale).toBe("en");
  });
});
