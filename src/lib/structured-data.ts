import { BRAND_NAME } from "@/lib/brand";
import { publicEnv } from "@/lib/env";
import { localizedPath, truncate } from "@/lib/seo";

// Dati strutturati schema.org (JSON-LD). Costruttori puri: ritornano oggetti pronti per il
// componente JsonLd. I valori vuoti (undefined, null) vengono tolti in profondità, perché
// lo schema non li ammette e Google li segnala. Gli URL sono assoluti.

const CONTEXT = "https://schema.org";

export type BreadcrumbItem = { name: string; path: string };

function siteBase(): string {
  return publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
}

// Percorso dell'app (che inizia con "/") o URL già assoluto.
function absolute(pathOrUrl: string): string {
  return pathOrUrl.startsWith("/") ? `${siteBase()}${pathOrUrl}` : pathOrUrl;
}

function pageUrl(locale: string, path: string): string {
  return `${siteBase()}${localizedPath(locale, path)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(cleanValue).filter((item) => item !== undefined);
  if (isPlainObject(value)) return cleanObject(value);
  return value;
}

function cleanObject(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).flatMap(([key, value]): [string, unknown][] => {
      const cleaned = cleanValue(value);
      return cleaned === undefined ? [] : [[key, cleaned]];
    }),
  );
}

function postalAddress(province: string) {
  return { "@type": "PostalAddress", addressRegion: province, addressCountry: "IT" };
}

function geo(latitude: number, longitude: number) {
  return { "@type": "GeoCoordinates", latitude, longitude };
}

function organizationRef() {
  return {
    "@type": "Organization",
    name: BRAND_NAME,
    url: siteBase(),
    logo: { "@type": "ImageObject", url: absolute("/icons/icon-512.png") },
  };
}

// Organizzazione del sito: nel layout pubblico o nella home.
export function organization(): Record<string, unknown> {
  return cleanObject({ "@context": CONTEXT, ...organizationRef() });
}

// Briciole di pane: il percorso di ogni voce è senza lingua (la aggiunge la lingua indicata).
export function breadcrumbList(items: BreadcrumbItem[], locale: string): Record<string, unknown> {
  return cleanObject({
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: pageUrl(locale, item.path),
    })),
  });
}

// Attrazione (un'attività). isFree va calcolato dal chiamante: vero solo con un prezzo in loco di 0 €
// (un prezzo mancante non è gratuito).
export function touristAttraction(input: {
  name: string;
  description: string | null;
  path: string;
  locale: string;
  placeName: string;
  province: string;
  latitude: number;
  longitude: number;
  isFree: boolean;
}): Record<string, unknown> {
  return cleanObject({
    "@context": CONTEXT,
    "@type": "TouristAttraction",
    name: input.name,
    description: input.description,
    url: pageUrl(input.locale, input.path),
    isAccessibleForFree: input.isFree,
    location: {
      "@type": "Place",
      name: input.placeName,
      address: postalAddress(input.province),
      geo: geo(input.latitude, input.longitude),
    },
  });
}

// Luogo (un borgo o una città, pagina /luoghi/<slug>).
export function place(input: {
  name: string;
  description: string | null;
  path: string;
  locale: string;
  province: string;
  latitude: number;
  longitude: number;
}): Record<string, unknown> {
  return cleanObject({
    "@context": CONTEXT,
    "@type": "TouristDestination",
    name: input.name,
    description: input.description,
    url: pageUrl(input.locale, input.path),
    geo: geo(input.latitude, input.longitude),
    address: postalAddress(input.province),
  });
}

// Itinerario pronto (pagina /itinerari/<slug>): le tappe sono le attività, in ordine di visita.
export function touristTrip(input: {
  name: string;
  description: string | null;
  path: string;
  locale: string;
  stops: { name: string; path: string }[];
}): Record<string, unknown> {
  return cleanObject({
    "@context": CONTEXT,
    "@type": "TouristTrip",
    name: input.name,
    description: input.description,
    url: pageUrl(input.locale, input.path),
    inLanguage: input.locale,
    itinerary: {
      "@type": "ItemList",
      itemListElement: input.stops.map((stop, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: { "@type": "TouristAttraction", name: stop.name, url: pageUrl(input.locale, stop.path) },
      })),
    },
  });
}

// Prodotto dello shop (passo 7: non ancora usato). Prezzo in euro come testo decimale ("12.50").
export function product(input: {
  name: string;
  description: string | null;
  path: string;
  locale: string;
  imageUrl: string | null;
  priceEur: string;
  inStock: boolean;
}): Record<string, unknown> {
  const url = pageUrl(input.locale, input.path);
  return cleanObject({
    "@context": CONTEXT,
    "@type": "Product",
    name: input.name,
    description: input.description,
    url,
    image: input.imageUrl ? absolute(input.imageUrl) : undefined,
    offers: {
      "@type": "Offer",
      price: input.priceEur,
      priceCurrency: "EUR",
      availability: input.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url,
    },
  });
}

// Articolo (guida editoriale). imageUrl è il percorso della copertina (/api/media/...) o null.
// L'autore è una persona o la redazione: qui è sempre il nome visibile in pagina.
export function article(input: {
  title: string;
  summary: string | null;
  author: string;
  publishedAt: string;
  updatedAt: string;
  imageUrl: string | null;
  path: string;
  locale: string;
}): Record<string, unknown> {
  const url = pageUrl(input.locale, input.path);
  return cleanObject({
    "@context": CONTEXT,
    "@type": "Article",
    headline: truncate(input.title, 110),
    description: truncate(input.summary, 300),
    inLanguage: input.locale,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: input.imageUrl ? absolute(input.imageUrl) : undefined,
    datePublished: input.publishedAt,
    dateModified: input.updatedAt,
    author: { "@type": "Person", name: input.author },
    publisher: organizationRef(),
  });
}
