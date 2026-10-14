import type { CatalogImportColumn } from "./columns";

export type ImportIssueCode =
  | "slug_invalid"
  | "name_missing"
  | "name_too_long"
  | "place_slug_invalid"
  | "duration_invalid"
  | "price_invalid"
  | "boolean_invalid"
  | "season_invalid"
  | "diet_invalid"
  | "interests_invalid"
  | "interest_unknown"
  | "source_url_invalid"
  | "notes_too_long"
  | "tagline_too_long"
  | "coordinates_invalid"
  | "province_invalid"
  | "place_missing_data"
  | "area_unknown"
  | "duplicate_slug"
  | "place_inactive_for_active"
  | "image_not_found"
  | "image_ambiguous"
  | "place_data_ignored";

export type ImportIssue = { code: ImportIssueCode; column?: CatalogImportColumn; value?: string };

export type ImportRowStatus = "create" | "update" | "error";

export type ImportRowPreview = {
  line: number;
  slug: string;
  title: string;
  status: ImportRowStatus;
  placeSlug: string;
  createsPlace: boolean;
  activeNow: boolean; // activeNow: attività esistente già attiva (le modifiche vanno online)
  errors: ImportIssue[];
  warnings: ImportIssue[];
};

export type CatalogImportPreview = {
  fileName: string;
  totals: { create: number; update: number; error: number; placesCreated: number };
  rows: ImportRowPreview[];
};

export type CatalogImportFileError =
  | "file_missing"
  | "file_too_large"
  | "file_not_csv"
  | "file_empty"
  | "header_invalid"
  | "too_many_rows";

export type CatalogImportResult = { created: number; updated: number; skipped: number; placesCreated: number };
