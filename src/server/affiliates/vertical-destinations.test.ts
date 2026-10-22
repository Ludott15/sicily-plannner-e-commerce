import { describe, expect, it } from "vitest";
import { pageFor, PARTNER_PAGES } from "./vertical-pages";
import {
  buildVerticalTarget,
  destinationFor,
  passesSearchFor,
  verticalFields,
  type PartnerTemplate,
  type VerticalLink,
} from "./vertical-links";

// Template e host come in supabase/migrations/20261021151418_affiliate_partner_verticali.sql (tenerli allineati).
const SUBID = "abcdef0123456789";
const NOW = 1_800_000_000;

const HOSTELWORLD: PartnerTemplate = {
  searchUrlTemplate: "https://www.hostelworld.com/pwa/s?{page}&from={checkin}&to={checkout}&guests={adults}",
  allowedHosts: ["www.hostelworld.com"],
  subidParam: null,
};
const TIQETS: PartnerTemplate = { searchUrlTemplate: "https://www.tiqets.com/{page}", allowedHosts: ["www.tiqets.com"], subidParam: null };
const CLICKANDBOAT: PartnerTemplate = {
  searchUrlTemplate: "https://www.clickandboat.com/{page}",
  allowedHosts: ["www.clickandboat.com"],
  subidParam: null,
};
const DIRECTFERRIES: PartnerTemplate = {
  searchUrlTemplate: "https://www.directferries.com/{page}",
  allowedHosts: ["www.directferries.com"],
  subidParam: null,
};
const DISCOVERCARS: PartnerTemplate = {
  searchUrlTemplate: "https://www.discovercars.com/{page}?a_aid={partner_id}&data1={subid}",
  allowedHosts: ["www.discovercars.com"],
  subidParam: "data1",
};
const HEYMONDO: PartnerTemplate = { searchUrlTemplate: "https://www.heymondo.it/", allowedHosts: ["www.heymondo.it"], subidParam: null };
const AIRALO: PartnerTemplate = { searchUrlTemplate: "https://www.airalo.com/Italy-esim", allowedHosts: ["www.airalo.com"], subidParam: null };
const BOOKING: PartnerTemplate = {
  searchUrlTemplate:
    "https://www.booking.com/searchresults.html?ss={place}&checkin={checkin}&checkout={checkout}&group_adults={adults}&aid={partner_id}&label={subid}&lang={locale}&nflt={kind}",
  allowedHosts: ["www.booking.com"],
  subidParam: "label",
};

const BASE: VerticalLink = {
  partner: "hostelworld",
  vertical: "lodging",
  place: "palermo",
  locale: "it",
  from: "",
  to: "",
  date: "",
  kind: "",
  airport: "",
  checkin: "2026-11-03",
  checkout: "2026-11-05",
  adults: 2,
  context: "page",
  itineraryId: null,
  expiresAt: NOW + 3600,
};

function dest(link: VerticalLink, template: PartnerTemplate, placeName: string | null = null) {
  return destinationFor(link, template, { placeName, partnerId: null, subid: SUBID, locale: "it", page: pageFor(link) });
}

describe("pagine verificate per partner", () => {
  it("Hostelworld a Palermo: pagina città con date e ospiti, ricerca completa", () => {
    const out = dest(BASE, HOSTELWORLD);
    expect(out?.url).toBe(
      "https://www.hostelworld.com/pwa/s?q=Palermo%2C+Italy&country=Italy&city=Palermo&type=city&id=1216&page=1&from=2026-11-03&to=2026-11-05&guests=2",
    );
    expect(out?.passesSearch).toBe("full");
  });

  it("Hostelworld in una città non in mappa: home, nessuna ricerca", () => {
    const out = dest({ ...BASE, place: "taormina" }, HOSTELWORLD);
    expect(out).toEqual({ url: "https://www.hostelworld.com/", passesSearch: "none" });
  });

  it("home di ripiego con subid_param: il subid resta nell'URL", () => {
    const withParam: PartnerTemplate = { ...HOSTELWORLD, subidParam: "ref" };
    const out = buildVerticalTarget(withParam, { subid: SUBID, page: "", checkin: "2026-11-03", checkout: "2026-11-05", adults: "2" });
    expect(out?.url).toBe(`https://www.hostelworld.com/?ref=${SUBID}`);
    expect(out?.fallback).toBe(true);
  });

  it("Tiqets a Palermo: pagina della città, che porta il luogo (biglietti: ricerca completa)", () => {
    const out = dest({ ...BASE, partner: "tiqets", vertical: "tickets", checkin: "", checkout: "", adults: 0, kind: "" }, TIQETS);
    expect(out).toEqual({ url: "https://www.tiqets.com/en/palermo-attractions-c71428/", passesSearch: "full" });
  });

  it("Tiqets in una città non in mappa (Catania): home", () => {
    const out = dest({ ...BASE, partner: "tiqets", vertical: "tickets", place: "catania", checkin: "", checkout: "", adults: 0 }, TIQETS);
    expect(out).toEqual({ url: "https://www.tiqets.com/", passesSearch: "none" });
  });

  it("Click&Boat a Palermo: pagina della città; la data non arriva, quindi ricerca parziale", () => {
    const link: VerticalLink = {
      ...BASE,
      partner: "clickandboat",
      vertical: "boat",
      place: "palermo",
      date: "2026-11-03",
      checkin: "",
      checkout: "",
      adults: 0,
    };
    expect(dest(link, CLICKANDBOAT)).toEqual({ url: "https://www.clickandboat.com/us/boat-rental/italy/palermo", passesSearch: "place" });
  });

  it("Direct Ferries Milazzo-Lipari: pagina della tratta; data e persone non arrivano (parziale)", () => {
    const link: VerticalLink = {
      ...BASE,
      partner: "directferries",
      vertical: "ferry",
      place: "",
      from: "milazzo",
      to: "lipari",
      date: "2026-11-03",
      checkin: "",
      checkout: "",
      adults: 2,
    };
    expect(verticalFields(link)).toBeDefined();
    expect(dest(link, DIRECTFERRIES)).toEqual({ url: "https://www.directferries.com/milazzo_lipari_ferry.htm", passesSearch: "place" });
  });

  it("Direct Ferries su una tratta non in mappa: home", () => {
    const link: VerticalLink = {
      ...BASE,
      partner: "directferries",
      vertical: "ferry",
      place: "",
      from: "milazzo",
      to: "napoli",
      date: "2026-11-03",
      checkin: "",
      checkout: "",
      adults: 2,
    };
    expect(dest(link, DIRECTFERRIES)).toEqual({ url: "https://www.directferries.com/", passesSearch: "none" });
  });

  it("DiscoverCars e Rentalcars all'aeroporto di Catania: pagina dell'aeroporto o della destinazione", () => {
    const car: VerticalLink = { ...BASE, partner: "discovercars", vertical: "car", place: "", airport: "CTA", adults: 0 };
    expect(dest(car, DISCOVERCARS)).toEqual({
      url: `https://www.discovercars.com/it/italy-sicily/catania-sicily?data1=${SUBID}`,
      passesSearch: "place",
    });
    // Con l'ID del partner configurato: a_aid entra nell'URL; senza, sparisce (caso sopra).
    const withId = destinationFor(car, DISCOVERCARS, { placeName: null, partnerId: "X1", subid: SUBID, locale: "it", page: pageFor(car) });
    expect(new URL(withId!.url).searchParams.get("a_aid")).toBe("X1");
    expect(new URL(withId!.url).searchParams.get("data1")).toBe(SUBID);
    const rental: VerticalLink = { ...car, partner: "rentalcars" };
    expect(dest(rental, { searchUrlTemplate: "https://www.rentalcars.com/{page}", allowedHosts: ["www.rentalcars.com"], subidParam: null })).toEqual({
      url: "https://www.rentalcars.com/on/airport/it/cta/rentacar",
      passesSearch: "place",
    });
  });

  it("Heymondo e Airalo: home italiana e pagina Italia, nessuna ricerca da passare", () => {
    const insurance: VerticalLink = { ...BASE, partner: "heymondo", vertical: "insurance", place: "", checkin: "", checkout: "", adults: 0 };
    expect(dest(insurance, HEYMONDO)).toEqual({ url: "https://www.heymondo.it/", passesSearch: "none" });
    const esim: VerticalLink = { ...BASE, partner: "airalo", vertical: "esim", place: "", checkin: "", checkout: "", adults: 0 };
    expect(dest(esim, AIRALO)).toEqual({ url: "https://www.airalo.com/Italy-esim", passesSearch: "none" });
  });

  it("Radical Storage a Palermo: pagina della città, ricerca completa per il deposito", () => {
    const link: VerticalLink = { ...BASE, partner: "radicalstorage", vertical: "luggage", place: "palermo", checkin: "", checkout: "", adults: 0 };
    const template: PartnerTemplate = {
      searchUrlTemplate: "https://radicalstorage.com/{page}",
      allowedHosts: ["radicalstorage.com"],
      subidParam: null,
    };
    expect(dest(link, template)).toEqual({ url: "https://radicalstorage.com/luggage-storage/palermo", passesSearch: "full" });
  });

  it("Booking resta com'è: ricerca per luogo con date e persone, ht_id vuoto", () => {
    const out = dest({ ...BASE, partner: "booking", place: "palermo" }, BOOKING, "Palermo");
    expect(out?.passesSearch).toBe("full");
    expect(new URL(out!.url).searchParams.get("nflt")).toBeNull();
    expect(new URL(out!.url).searchParams.get("ss")).toBe("Palermo");
  });

  it("le pagine della mappa sono solo per Palermo, il porto di Lipari e gli aeroporti verificati", () => {
    expect(Object.keys(PARTNER_PAGES.tiqets ?? {})).toEqual(["palermo"]);
    expect(Object.keys(PARTNER_PAGES.discovercars ?? {})).toEqual(["CTA"]);
    expect(Object.keys(PARTNER_PAGES.directferries ?? {})).toEqual(["milazzo>lipari"]);
    expect(pageFor({ ...BASE, partner: "directferries", vertical: "ferry", from: "milazzo", to: "napoli" })).toBeNull();
  });
});

describe("sicurezza dei segmenti di pagina", () => {
  it("un segmento di pagina con caratteri non ammessi: nessun link", () => {
    const values = { subid: SUBID, page: "en/x<script>", adults: "2", checkin: "2026-11-03", checkout: "2026-11-05" };
    expect(buildVerticalTarget(HOSTELWORLD, values)).toBeNull();
    expect(buildVerticalTarget(TIQETS, { subid: SUBID, page: "en/x?y" })).toBeNull();
  });

  it("un segmento di pagina non può cambiare l'host", () => {
    const out = buildVerticalTarget(TIQETS, { subid: SUBID, page: "@evil.example/x" });
    expect(out).toBeNull();
  });
});

describe("passesSearch", () => {
  it("nessun segnaposto e nessuna pagina: none", () => {
    expect(passesSearchFor("lodging", new Set(), [], false)).toBe("none");
  });

  it("solo il luogo per un alloggio con date: place", () => {
    expect(passesSearchFor("lodging", new Set(["place"]), [], false)).toBe("place");
  });

  it("luogo, date e persone per un alloggio: full (il tipo è facoltativo)", () => {
    expect(passesSearchFor("lodging", new Set(["place", "checkin", "checkout", "adults"]), [], false)).toBe("full");
  });

  it("verticale senza ricerca: none, anche se piena", () => {
    expect(passesSearchFor("insurance", new Set(), [], false)).toBe("none");
  });

  it("home di ripiego: none sempre", () => {
    expect(passesSearchFor("tickets", new Set(["place"]), ["place"], true)).toBe("none");
  });
});

describe("porto di Lipari", () => {
  it("Lipari è un porto della lista chiusa: la tratta Milazzo-Lipari è valida", () => {
    const link: VerticalLink = { ...BASE, partner: "ferryhopper", vertical: "ferry", place: "", from: "milazzo", to: "lipari", date: "2026-11-03", checkin: "", checkout: "", adults: 2 };
    expect(() => verticalFields(link)).not.toThrow();
  });
});
