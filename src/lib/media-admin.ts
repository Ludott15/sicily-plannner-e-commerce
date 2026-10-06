// Tipi condivisi tra le azioni server delle immagini (src/server/media/*.admin.ts) e i
// componenti dell'admin, che non possono importare i moduli .admin.ts.

export type UploadRejection =
  | { code: "too_large"; bytes: number }
  | { code: "unsupported_type"; format: string | null }
  | { code: "too_small"; width: number; height: number }
  | { code: "unreadable" }
  | { code: "unsafe_svg"; reason: string };

export type EntityType = "place" | "activity" | "itinerary" | "area";
export type MatchError = "unmatched_name" | "entity_not_found" | "entity_ambiguous";
export type EntityMatch = { ok: true; entity: { type: EntityType; name: string; slug: string } } | { ok: false; error: MatchError };

export type PreparedUpload =
  | { name: string; ok: true; path: string; uploadUrl: string; match: EntityMatch }
  | { name: string; ok: false; error: "too_large" | "unsupported_type" };

export type ProcessedUpload =
  | { ok: true; mediaId: string; match: EntityMatch; becameCover: boolean }
  | { ok: false; error: UploadRejection | { code: "storage_failed" } | { code: "invalid" } };

export type CoverState = { status: "idle" } | { status: "saved" } | { status: "error"; error: MatchError };

export type FetchErrorCode =
  | "invalid_url"
  | "host_not_allowed"
  | "redirect_not_allowed"
  | "too_many_redirects"
  | "private_address"
  | "timeout"
  | "too_large"
  | "bad_status"
  | "bad_content_type"
  | "network";

export type CommonsError =
  | "invalid_line"
  | "invalid_page_url"
  | "file_not_found"
  | "license_missing"
  | "license_sa"
  | "license_nc"
  | "license_nd"
  | "license_not_allowed"
  | "too_small"
  | "unsupported_type"
  | "metadata_unavailable"
  | `fetch_${FetchErrorCode}`;

export type CommonsFile = {
  title: string;
  pageUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  mime: string;
  author: string | null;
  authorUrl: string | null;
  license: string;
  licenseUrl: string | null;
  description: string | null;
  // Avvisi da mostrare nell'anteprima (diritti della persona ritratta, marchi, beni culturali).
  warnings: string[];
};

export type CommonsRowError = CommonsError | MatchError | "already_imported";

export type CommonsPreviewRow = {
  line: number;
  slug: string | null;
  match: EntityMatch | null;
  file: CommonsFile | null;
  error: CommonsRowError | null;
};

export type CommonsImportResult = {
  line: number;
  ok: boolean;
  mediaId?: string;
  becameCover?: boolean;
  error?: CommonsRowError | UploadRejection["code"] | "storage_failed";
};
