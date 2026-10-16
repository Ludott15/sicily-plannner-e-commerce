import { describe, expect, it, vi } from "vitest";
import {
  article,
  breadcrumbList,
  organization,
  place,
  product,
  touristAttraction,
  touristTrip,
} from "./structured-data";

vi.mock("@/lib/env", () => ({ publicEnv: { NEXT_PUBLIC_SITE_URL: "https://isula.test/" } }));

const BASE = "https://isula.test";

// Campi che Google (o schema.org) richiede per ciascun tipo prodotto dai costruttori.
const REQUIRED: Record<string, readonly string[]> = {
  Organization: ["name", "url", "logo"],
  BreadcrumbList: ["itemListElement"],
  TouristAttraction: ["name", "url", "location"],
  TouristDestination: ["name", "url", "geo"],
  TouristTrip: ["name", "url", "itinerary"],
  Product: ["name", "url", "offers"],
  Article: ["headline", "datePublished", "dateModified", "author", "publisher", "url"],
};

// Chiavi i cui valori stringa sono URL: devono essere assoluti.
const URL_KEYS = new Set(["url", "item", "image", "@id", "logo"]);

function walk(value: unknown, path: string, visit: (value: unknown, path: string) => void): void {
  visit(value, path);
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
  else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, visit);
  }
}

// Controlli comuni a tutti i dati strutturati: contesto, tipo, campi richiesti, nessun valore
// vuoto nel JSON e URL assoluti.
function assertStructuredData(data: Record<string, unknown>) {
  expect(data["@context"]).toBe("https://schema.org");
  const type = data["@type"];
  expect(typeof type).toBe("string");
  for (const key of REQUIRED[String(type)] ?? []) {
    expect(data, `${String(type)}.${key}`).toHaveProperty(key);
  }

  walk(data, "$", (value, path) => {
    expect(value, path).not.toBeUndefined();
    expect(value, path).not.toBeNull();
    const key = path.split(".").pop() ?? "";
    if (typeof value === "string" && URL_KEYS.has(key)) {
      expect(value, path).toMatch(/^https:\/\//);
      expect(() => new URL(value), path).not.toThrow();
    }
  });

  // Il JSON serializzato è identico all'oggetto: nessun campo sparisce o resta vuoto.
  expect(JSON.parse(JSON.stringify(data))).toStrictEqual(data);
}

describe("breadcrumbList", () => {
  it("numera le voci e le lega all'URL della lingua", () => {
    const data = breadcrumbList(
      [
        { name: "Sicilia", path: "/sicilia/palermo" },
        { name: "Palermo", path: "/luoghi/demo-palermo" },
      ],
      "en",
    );
    assertStructuredData(data);
    expect(data).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Sicilia", item: `${BASE}/en/sicilia/palermo` },
        { "@type": "ListItem", position: 2, name: "Palermo", item: `${BASE}/en/luoghi/demo-palermo` },
      ],
    });
  });

  it("la home come voce non ha percorso aggiuntivo", () => {
    const data = breadcrumbList([{ name: "Home", path: "/" }], "it");
    assertStructuredData(data);
    expect(data).toMatchObject({ itemListElement: [{ item: `${BASE}/it` }] });
  });
});

describe("organization", () => {
  it("nome del marchio, sito e logo assoluti", () => {
    const data = organization();
    assertStructuredData(data);
    expect(data).toMatchObject({
      "@type": "Organization",
      name: "Isula",
      url: BASE,
      logo: { "@type": "ImageObject", url: `${BASE}/icons/icon-512.png` },
    });
  });
});

describe("touristAttraction", () => {
  it("un'attività gratuita con il luogo e le coordinate", () => {
    const data = touristAttraction({
      name: "Visita guidata",
      description: "Un giro a piedi.",
      path: "/attivita/demo-giro",
      locale: "it",
      placeName: "Palermo",
      province: "PA",
      latitude: 38.1,
      longitude: 13.36,
      isFree: true,
    });
    assertStructuredData(data);
    expect(data).toMatchObject({
      "@type": "TouristAttraction",
      url: `${BASE}/it/attivita/demo-giro`,
      isAccessibleForFree: true,
      location: {
        "@type": "Place",
        name: "Palermo",
        address: { "@type": "PostalAddress", addressRegion: "PA", addressCountry: "IT" },
        geo: { "@type": "GeoCoordinates", latitude: 38.1, longitude: 13.36 },
      },
    });
  });

  it("senza descrizione il campo non compare (niente null nel JSON)", () => {
    const data = touristAttraction({
      name: "Nome",
      description: null,
      path: "/attivita/x",
      locale: "it",
      placeName: "Luogo",
      province: "CT",
      latitude: 37.5,
      longitude: 15.1,
      isFree: false,
    });
    assertStructuredData(data);
    expect(data).not.toHaveProperty("description");
  });
});

describe("place", () => {
  it("luogo come destinazione turistica", () => {
    const data = place({
      name: "Cefalù",
      description: "Borgo sul mare.",
      path: "/luoghi/demo-cefalu",
      locale: "en",
      province: "PA",
      latitude: 38.03,
      longitude: 14.02,
    });
    assertStructuredData(data);
    expect(data).toMatchObject({ "@type": "TouristDestination", url: `${BASE}/en/luoghi/demo-cefalu` });
  });
});

describe("touristTrip", () => {
  it("itinerario con le tappe in ordine", () => {
    const data = touristTrip({
      name: "Tre giorni",
      description: null,
      path: "/itinerari/demo-tre-giorni",
      locale: "it",
      stops: [
        { name: "Duomo", path: "/attivita/demo-duomo" },
        { name: "Mercato", path: "/attivita/demo-mercato" },
      ],
    });
    assertStructuredData(data);
    expect(data).toMatchObject({
      "@type": "TouristTrip",
      inLanguage: "it",
      itinerary: {
        "@type": "ItemList",
        itemListElement: [
          { position: 1, item: { "@type": "TouristAttraction", name: "Duomo", url: `${BASE}/it/attivita/demo-duomo` } },
          { position: 2, item: { name: "Mercato" } },
        ],
      },
    });
  });
});

describe("product", () => {
  it("prodotto con offerta in euro e disponibilità", () => {
    const data = product({
      name: "Olio",
      description: "Olio extravergine.",
      path: "/shop/olio",
      locale: "it",
      imageUrl: "/api/media/x/v1/4x5-800.webp",
      priceEur: "12.50",
      inStock: true,
    });
    assertStructuredData(data);
    expect(data).toMatchObject({
      "@type": "Product",
      image: `${BASE}/api/media/x/v1/4x5-800.webp`,
      offers: {
        "@type": "Offer",
        price: "12.50",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
      },
    });
  });

  it("senza immagine e fuori stock", () => {
    const data = product({
      name: "Vino",
      description: null,
      path: "/shop/vino",
      locale: "en",
      imageUrl: null,
      priceEur: "8",
      inStock: false,
    });
    assertStructuredData(data);
    expect(data).not.toHaveProperty("image");
    expect(data).toMatchObject({ offers: { availability: "https://schema.org/OutOfStock" } });
  });
});

describe("article", () => {
  const base = {
    title: "Prima volta in Sicilia",
    summary: "Una guida per chi arriva per la prima volta.",
    author: "Redazione",
    publishedAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-02T09:00:00.000Z",
    imageUrl: "/api/media/m/v1/16x9-1200.avif",
    path: "/guide/prima-volta",
    locale: "it",
  };

  it("articolo con autore, date, copertina e editore", () => {
    const data = article(base);
    assertStructuredData(data);
    expect(data).toMatchObject({
      "@type": "Article",
      headline: "Prima volta in Sicilia",
      description: "Una guida per chi arriva per la prima volta.",
      datePublished: "2026-10-01T10:00:00.000Z",
      dateModified: "2026-10-02T09:00:00.000Z",
      author: { "@type": "Person", name: "Redazione" },
      publisher: { "@type": "Organization", name: "Isula" },
      image: `${BASE}/api/media/m/v1/16x9-1200.avif`,
      url: `${BASE}/it/guide/prima-volta`,
      mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE}/it/guide/prima-volta` },
      inLanguage: "it",
    });
  });

  it("senza sommario né copertina, e con il titolo accorciato a 110 caratteri", () => {
    const data = article({ ...base, title: "t".repeat(200), summary: null, imageUrl: null });
    assertStructuredData(data);
    expect(data).not.toHaveProperty("image");
    expect(data).not.toHaveProperty("description");
    expect(typeof data.headline).toBe("string");
    expect((data.headline as string).length).toBeLessThanOrEqual(110);
  });
});
