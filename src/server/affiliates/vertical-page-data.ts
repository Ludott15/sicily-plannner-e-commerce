import "server-only";
import { asc, eq } from "drizzle-orm";
import { areas, places } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";
import { listGuides } from "@/server/editorial/queries";
import { getPartnerConfig } from "./partners";
import { buildVerticalHref, type VerticalCallContext, type VerticalSearchInput } from "./verticals";
import { VERTICAL_PARTNERS, type PassesSearch, type Vertical } from "./vertical-links";

// Dati e esito delle pagine delle verticali (/traghetti, /barche, ...). Lettura pubblica (dbPublic):
// solo ciò che il catalogo mostra già. Il link si costruisce sempre in buildVerticalHref, che dice anche
// quanta ricerca arriva al partner (passesSearch: "full" | "place" | "none").

// Luoghi attivi del catalogo, con la zona: per i menu di transfer, biglietti, barche e deposito.
export type PlaceOption = { slug: string; name: string; areaName: string };

export async function listVerticalPlaces(locale: string): Promise<PlaceOption[]> {
  const isEn = locale === "en";
  const rows = await dbPublic((tx) =>
    tx
      .select({
        slug: places.slug,
        name: places.name,
        areaNameIt: areas.nameIt,
        areaNameEn: areas.nameEn,
      })
      .from(places)
      .innerJoin(areas, eq(areas.id, places.areaId))
      .where(eq(places.isActive, true))
      .orderBy(asc(areas.sort), asc(places.name)),
  );
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    areaName: isEn ? row.areaNameEn : row.areaNameIt,
  }));
}

// Partner attivi di una verticale (il predefinito è il primo), con il nome da mostrare.
export type PartnerOption = { partner: string; name: string };

export async function activePartners(vertical: Vertical): Promise<PartnerOption[]> {
  const keys = VERTICAL_PARTNERS[vertical];
  const configs = await Promise.all(keys.map((key) => getPartnerConfig(key)));
  return keys.flatMap((partner, index) => {
    const config = configs[index];
    return config && config.isActive ? [{ partner, name: config.name }] : [];
  });
}

// Guide pubblicate tra quelle indicate per la verticale (uno slug mancante non genera un link rotto).
export async function publishedGuides(locale: string, slugs: readonly string[]): Promise<{ slug: string; title: string }[]> {
  const guides = await listGuides(locale);
  return slugs.flatMap((slug) => {
    const guide = guides.find((item) => item.slug === slug);
    return guide ? [{ slug, title: guide.title }] : [];
  });
}

// Esito della ricerca per la pagina. "unavailable" = il partner non può ricevere traffico (inattivo,
// senza template); "invalid" = la ricerca non è valida (valori fuori dalle liste, luogo non nel catalogo).
export type VerticalOutcome =
  | { status: "ready"; href: string; partnerName: string; passesSearch: PassesSearch }
  | { status: "unavailable" }
  | { status: "invalid" };

export async function searchOutcome(input: VerticalSearchInput, ctx: VerticalCallContext): Promise<VerticalOutcome> {
  const result = await buildVerticalHref(input, ctx);
  if ("href" in result) {
    return { status: "ready", href: result.href, partnerName: result.partnerName, passesSearch: result.passesSearch };
  }
  return { status: result.error === "inactive" ? "unavailable" : "invalid" };
}
