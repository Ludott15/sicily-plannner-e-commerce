import type { Metadata } from "next";
import { routing } from "@/lib/i18n/routing";

// Percorso senza query né frammento, con lo slash iniziale e senza quello finale (la home è "/").
function cleanPath(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? "";
  const rooted = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const trimmed = rooted.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function isLocale(locale: string): boolean {
  return (routing.locales as readonly string[]).includes(locale);
}

// Percorso di una pagina nella lingua indicata, relativo (lo completa metadataBase) o
// assoluto se si passa la base del sito. La lingua sconosciuta cade su quella predefinita.
export function localizedPath(locale: string, path: string): string {
  const lang = isLocale(locale) ? locale : routing.defaultLocale;
  const clean = cleanPath(path);
  return clean === "/" ? `/${lang}` : `/${lang}${clean}`;
}

// canonical e hreflang di una pagina. Il canonical è sempre il percorso senza query: le pagine
// con filtri nell'URL (/attivita?interessi=...) indicano la versione senza filtri. Le pagine
// sono disponibili in tutte le lingue, con x-default sulla lingua predefinita.
export function canonicalFor(locale: string, path: string): { canonical: string; languages: Record<string, string> } {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = localizedPath(l, path);
  languages["x-default"] = localizedPath(routing.defaultLocale, path);
  return { canonical: localizedPath(locale, path), languages };
}

// Alternates per Metadata di Next: stessa informazione di canonicalFor.
export function localizedAlternates(locale: string, path: string): Metadata["alternates"] {
  return canonicalFor(locale, path);
}

export function truncate(text: string | null | undefined, max = 160): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

// Serializza il JSON-LD senza permettere la chiusura del tag <script>.
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
