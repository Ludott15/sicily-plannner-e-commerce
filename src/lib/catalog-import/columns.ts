// Colonne del CSV di importazione del catalogo (intestazione in ordine fisso nel modello).

export const CATALOG_IMPORT_COLUMNS = [
  "slug",
  "name_it",
  "name_en",
  "area_slug",
  "place_slug",
  "place_name",
  "place_province",
  "place_lat",
  "place_lng",
  "place_tagline_it",
  "description_it",
  "duration_min",
  "on_site_price_eur",
  "requires_car",
  "accessible",
  "season_months",
  "diets_suitable",
  "interests",
  "image_file",
  "source_url",
  "notes",
] as const;

export type CatalogImportColumn = (typeof CATALOG_IMPORT_COLUMNS)[number];

export const REQUIRED_IMPORT_COLUMNS: readonly CatalogImportColumn[] = ["slug", "name_it", "place_slug", "duration_min"];

export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_IMPORT_ROWS = 1000;

// Solo intestazione, con a capo CRLF finale.
export function catalogImportTemplate(): string {
  return `${CATALOG_IMPORT_COLUMNS.join(",")}\r\n`;
}
