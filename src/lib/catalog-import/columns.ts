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

export const MAX_IMPORT_BYTES = 2_000_000;
export const MAX_IMPORT_ROWS = 2000;

// Riquadro della Sicilia, isole minori comprese (gradi decimali, limiti inclusi).
// Una coordinata valida fuori da questi limiti rende la riga un errore.
export const SICILY_BOUNDS = {
  lat: { min: 35.4, max: 38.9 },
  lng: { min: 11.9, max: 15.7 },
} as const;

type TemplateRow = Partial<Record<CatalogImportColumn, string>>;

// Due righe di esempio dichiaratamente di prova: slug e luoghi con prefisso demo-, testi dichiarati di prova.
const TEMPLATE_EXAMPLES: readonly TemplateRow[] = [
  {
    slug: "demo-esempio-passeggiata",
    name_it: "Esempio di attività",
    name_en: "Example activity",
    area_slug: "siracusano",
    place_slug: "demo-luogo-esempio",
    place_name: "Luogo di esempio",
    place_province: "SR",
    place_lat: "37.0755",
    place_lng: "15.2866",
    place_tagline_it: "Frase di esempio del luogo",
    description_it: "Descrizione di prova: scrivi qui un testo con parole tue.",
    duration_min: "90",
    on_site_price_eur: "12,50",
    requires_car: "no",
    accessible: "sì",
    season_months: "4;5;6;7;8;9;10",
    diets_suitable: "vegetarian;gluten_free",
    interests: "sea:3;history_archaeology:2",
    notes: "Nota interna di esempio",
  },
  {
    slug: "demo-esempio-degustazione",
    name_it: "Secondo esempio di attività",
    area_slug: "barocco-ibleo",
    place_slug: "demo-luogo-esempio-due",
    place_name: "Secondo luogo di esempio",
    place_province: "RG",
    place_lat: "36.8627",
    place_lng: "14.7646",
    place_tagline_it: "Un secondo luogo di prova",
    description_it: "Altra descrizione di prova.",
    duration_min: "60",
    requires_car: "sì",
    accessible: "no",
    interests: "food_wine:3;local_experiences:2",
  },
];

// Campo CSV: tra virgolette se contiene il separatore, ";", virgolette o un a capo (le virgolette si raddoppiano).
function csvField(value: string): string {
  if (!/[",;\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

// Intestazione e due righe di esempio, con a capo CRLF finale.
export function catalogImportTemplate(): string {
  const lines = [
    CATALOG_IMPORT_COLUMNS.join(","),
    ...TEMPLATE_EXAMPLES.map((example) => CATALOG_IMPORT_COLUMNS.map((column) => csvField(example[column] ?? "")).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
