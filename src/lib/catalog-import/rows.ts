import { z } from "zod";
import { PROVINCES } from "@/lib/provinces";
import { CATALOG_IMPORT_COLUMNS, REQUIRED_IMPORT_COLUMNS, SICILY_BOUNDS, type CatalogImportColumn } from "./columns";
import type { ImportIssue, ImportIssueCode } from "./types";

// Validazione pura di una riga del CSV (nessun accesso al database).
// La riga restituisce TUTTI gli errori trovati, non solo il primo.

export type ColumnIndex = Record<CatalogImportColumn, number | undefined>;

export type CheckHeaderResult =
  | { ok: true; index: ColumnIndex }
  | { ok: false; missing: string[]; unknown: string[] };

export type InterestOption = { key: string; labelIt: string };

export type NormalizedImportRow = {
  line: number;
  slug: string;
  title: string;
  titleEn: string | null;
  description: string | null;
  durationMin: number;
  onSitePriceEur: string | null;
  requiresCar: boolean;
  accessible: boolean;
  seasonMonths: number[];
  dietFriendly: string[];
  tags: { key: string; strength: number }[];
  imageFile: string | null;
  sourceUrl: string | null;
  notes: string | null;
  place: {
    slug: string;
    name: string | null;
    province: string | null;
    lat: number | null;
    lng: number | null;
    areaSlug: string | null;
    taglineIt: string | null;
  };
};

export type NormalizeRowResult =
  | { ok: true; row: NormalizedImportRow }
  | { ok: false; slug: string; title: string; errors: ImportIssue[] };

type Result<T> = { ok: true; value: T } | { ok: false; issues: ImportIssue[] };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIET_KEYS = ["vegetarian", "vegan", "gluten_free", "lactose_free"] as const;
const TRUE_WORDS: ReadonlySet<string> = new Set(["sì", "si", "s", "true", "1", "yes", "y"]);
const FALSE_WORDS: ReadonlySet<string> = new Set(["no", "n", "false", "0", ""]);
const ALL_MONTHS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MAX_VALUE_LENGTH = 120;

const slugSchema = z.string().min(2).max(80).regex(SLUG_PATTERN);
const titleSchema = z.string().max(200);
const taglineSchema = z.string().max(90);
const notesSchema = z.string().max(2000);
const monthSchema = z
  .string()
  .regex(/^\d{1,2}$/)
  .transform((s) => Number(s))
  .pipe(z.number().int().min(1).max(12));
const dietSchema = z
  .string()
  .transform((s) => s.toLowerCase())
  .pipe(z.enum(DIET_KEYS));
const strengthSchema = z
  .string()
  .regex(/^[1-3]$/)
  .transform((s) => Number(s));
const durationSchema = z
  .string()
  .regex(/^\d{1,4}$/)
  .transform((s) => Number(s))
  .pipe(z.number().int().min(1).max(1440));
// Decimali con punto o virgola; il prezzo è sempre >= 0 (niente segno nel pattern).
const priceSchema = z
  .string()
  .regex(/^\d{1,6}(?:[.,]\d{1,2})?$/)
  .transform((s) => Number(s.replace(",", ".")).toFixed(2));
const coordinateSchema = (limit: number) =>
  z
    .string()
    .regex(/^[+-]?\d+(?:[.,]\d+)?$/)
    .transform((s) => Number(s.replace(",", ".")))
    .pipe(z.number().min(-limit).max(limit));
const provinceSchema = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((s) => s.toUpperCase())
  .refine((s) => Object.prototype.hasOwnProperty.call(PROVINCES, s));
const sourceUrlSchema = z.string().max(2000).refine(isHttpUrl);
const booleanSchema = z
  .string()
  .refine((s) => parseBoolean(s) !== undefined)
  .transform((s) => parseBoolean(s) === true);

export function checkHeader(header: string[]): CheckHeaderResult {
  const index: ColumnIndex = Object.fromEntries(CATALOG_IMPORT_COLUMNS.map((column) => [column, undefined])) as ColumnIndex;
  const unknown: string[] = [];

  header.forEach((raw, position) => {
    const name = normalizeHeaderName(raw);
    if (name === "") return;
    if (!isKnownColumn(name) || index[name] !== undefined) {
      unknown.push(raw.trim());
      return;
    }
    index[name] = position;
  });

  const missing = REQUIRED_IMPORT_COLUMNS.filter((column) => index[column] === undefined);
  if (missing.length > 0 || unknown.length > 0) return { ok: false, missing: [...missing], unknown };
  return { ok: true, index };
}

export function normalizeRow(
  line: number,
  cells: string[],
  index: ColumnIndex,
  interests: readonly InterestOption[],
): NormalizeRowResult {
  const cell = (column: CatalogImportColumn): string => {
    const position = index[column];
    return position === undefined ? "" : (cells[position] ?? "").trim();
  };
  const errors: ImportIssue[] = [];

  const slugRaw = cell("slug");
  take(check(slugSchema, slugRaw, "slug", "slug_invalid"), errors, "");

  const nameRaw = cell("name_it");
  const title = take(
    nameRaw === "" ? { ok: false, issues: [makeIssue("name_missing", "name_it")] } : check(titleSchema, nameRaw, "name_it", "name_too_long"),
    errors,
    "",
  );

  const nameEnRaw = cell("name_en");
  const titleEn = take(
    optional(nameEnRaw, () => check(titleSchema, nameEnRaw, "name_en", "name_too_long")),
    errors,
    null,
  );

  const areaRaw = cell("area_slug");
  const areaSlug = take(
    optional(areaRaw, () => check(slugSchema, areaRaw, "area_slug", "area_unknown")),
    errors,
    null,
  );

  const placeSlugRaw = cell("place_slug");
  const placeSlug = take(check(slugSchema, placeSlugRaw, "place_slug", "place_slug_invalid"), errors, "");

  const placeNameRaw = cell("place_name");
  const placeName = take(
    optional(placeNameRaw, () => check(titleSchema, placeNameRaw, "place_name", "name_too_long")),
    errors,
    null,
  );

  const provinceRaw = cell("place_province");
  const province = take(
    optional(provinceRaw, () => check(provinceSchema, provinceRaw, "place_province", "province_invalid")),
    errors,
    null,
  );

  const latRaw = cell("place_lat");
  const lat = take(
    optional(latRaw, () => check(coordinateSchema(90), latRaw, "place_lat", "coordinates_invalid")),
    errors,
    null,
  );

  const lngRaw = cell("place_lng");
  const lng = take(
    optional(lngRaw, () => check(coordinateSchema(180), lngRaw, "place_lng", "coordinates_invalid")),
    errors,
    null,
  );

  // Coordinate valide ma fuori dalla Sicilia: errore della riga (un numero non valido resta coordinates_invalid).
  if (lat !== null && !withinRange(lat, SICILY_BOUNDS.lat)) errors.push(makeIssue("coordinates_outside_sicily", "place_lat", latRaw));
  if (lng !== null && !withinRange(lng, SICILY_BOUNDS.lng)) errors.push(makeIssue("coordinates_outside_sicily", "place_lng", lngRaw));

  const taglineRaw = cell("place_tagline_it");
  const taglineIt = take(
    optional(taglineRaw, () => check(taglineSchema, taglineRaw, "place_tagline_it", "tagline_too_long")),
    errors,
    null,
  );

  const descriptionRaw = cell("description_it");

  const durationRaw = cell("duration_min");
  const durationMin = take(check(durationSchema, durationRaw, "duration_min", "duration_invalid"), errors, 0);

  const priceRaw = cell("on_site_price_eur");
  const onSitePriceEur = take(
    optional(priceRaw, () => check(priceSchema, priceRaw, "on_site_price_eur", "price_invalid")),
    errors,
    null,
  );

  const requiresCar = take(check(booleanSchema, cell("requires_car"), "requires_car", "boolean_invalid"), errors, false);
  const accessible = take(check(booleanSchema, cell("accessible"), "accessible", "boolean_invalid"), errors, false);

  const seasonMonths = take(resolveSeason(cell("season_months")), errors, [...ALL_MONTHS]);
  const dietFriendly = take(resolveDiets(cell("diets_suitable")), errors, []);
  const tags = take(resolveInterests(cell("interests"), interests), errors, []);

  const imageFile = cell("image_file") === "" ? null : cell("image_file");

  const sourceRaw = cell("source_url");
  const sourceUrl = take(
    optional(sourceRaw, () => check(sourceUrlSchema, sourceRaw, "source_url", "source_url_invalid")),
    errors,
    null,
  );

  const notesRaw = cell("notes");
  const notes = take(
    optional(notesRaw, () => check(notesSchema, notesRaw, "notes", "notes_too_long")),
    errors,
    null,
  );

  if (errors.length > 0) return { ok: false, slug: slugRaw, title: nameRaw, errors };

  return {
    ok: true,
    row: {
      line,
      slug: slugRaw,
      title,
      titleEn,
      description: descriptionRaw === "" ? null : descriptionRaw,
      durationMin,
      onSitePriceEur,
      requiresCar,
      accessible,
      seasonMonths,
      dietFriendly,
      tags,
      imageFile,
      sourceUrl,
      notes,
      place: {
        slug: placeSlug,
        name: placeName,
        province,
        lat,
        lng,
        areaSlug,
        taglineIt,
      },
    },
  };
}

function normalizeHeaderName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

function isKnownColumn(name: string): name is CatalogImportColumn {
  return (CATALOG_IMPORT_COLUMNS as readonly string[]).includes(name);
}

function makeIssue(code: ImportIssueCode, column?: CatalogImportColumn, value?: string): ImportIssue {
  const issue: ImportIssue = { code };
  if (column !== undefined) issue.column = column;
  if (value !== undefined && value !== "") issue.value = value.slice(0, MAX_VALUE_LENGTH);
  return issue;
}

function check<T>(schema: z.ZodType<T>, raw: string, column: CatalogImportColumn, code: ImportIssueCode): Result<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, issues: [makeIssue(code, column, raw)] };
}

function withinRange(value: number, range: { readonly min: number; readonly max: number }): boolean {
  return value >= range.min && value <= range.max;
}

// Il valore se valido; altrimenti accumula gli errori e restituisce il ripiego.
function take<T>(result: Result<T>, errors: ImportIssue[], fallback: T): T {
  if (result.ok) return result.value;
  errors.push(...result.issues);
  return fallback;
}

// Campo facoltativo: vuoto = null, altrimenti la validazione.
function optional<T>(raw: string, run: () => Result<T>): Result<T | null> {
  return raw === "" ? { ok: true, value: null } : run();
}

// Liste separate da ";" o "|"; i token vuoti (es. ";" finale) si ignorano.
function splitList(raw: string): string[] {
  return raw
    .split(/[;|]/)
    .map((token) => token.trim())
    .filter((token) => token !== "");
}

function checkTokens<T>(tokens: string[], schema: z.ZodType<T>, column: CatalogImportColumn, code: ImportIssueCode): Result<T[]> {
  const issues: ImportIssue[] = [];
  const values: T[] = [];
  for (const token of tokens) {
    const result = check(schema, token, column, code);
    if (result.ok) values.push(result.value);
    else issues.push(...result.issues);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: values };
}

function resolveSeason(raw: string): Result<number[]> {
  const tokens = splitList(raw);
  if (tokens.length === 0) return { ok: true, value: [...ALL_MONTHS] };
  const result = checkTokens(tokens, monthSchema, "season_months", "season_invalid");
  if (!result.ok) return result;
  return { ok: true, value: [...new Set(result.value)].sort((a, b) => a - b) };
}

function resolveDiets(raw: string): Result<string[]> {
  const result = checkTokens(splitList(raw), dietSchema, "diets_suitable", "diet_invalid");
  if (!result.ok) return result;
  return { ok: true, value: [...new Set<string>(result.value)] };
}

function firstWord(label: string): string {
  return (label.trim().toLowerCase().split(/\s+/)[0] ?? "");
}

// Chiave, poi etichetta intera, poi prima parola dell'etichetta se unica (senza distinzione di maiuscole).
function resolveInterest(keyPart: string, options: readonly InterestOption[]): string | null {
  const wanted = keyPart.toLowerCase();

  const byKey = options.find((option) => option.key.toLowerCase() === wanted);
  if (byKey) return byKey.key;

  const byLabel = options.find((option) => option.labelIt.trim().toLowerCase() === wanted);
  if (byLabel) return byLabel.key;

  const byWord = options.filter((option) => firstWord(option.labelIt) === wanted);
  const [only, ...others] = byWord;
  if (only !== undefined && others.length === 0) return only.key;
  return null;
}

// Formato "chiave:forza;chiave:forza", forza 1..3. Stessa chiave due volte: vale la forza maggiore.
function resolveInterests(raw: string, options: readonly InterestOption[]): Result<{ key: string; strength: number }[]> {
  const issues: ImportIssue[] = [];
  const strengths = new Map<string, number>();

  for (const token of splitList(raw)) {
    const parts = token.split(":");
    const keyPart = (parts[0] ?? "").trim();
    const strengthRaw = (parts[1] ?? "").trim();

    if (parts.length !== 2 || keyPart === "") {
      issues.push(makeIssue("interests_invalid", "interests", token));
      continue;
    }
    const strength = strengthSchema.safeParse(strengthRaw);
    if (!strength.success) {
      issues.push(makeIssue("interests_invalid", "interests", token));
      continue;
    }
    const key = resolveInterest(keyPart, options);
    if (key === null) {
      issues.push(makeIssue("interest_unknown", "interests", keyPart));
      continue;
    }
    strengths.set(key, Math.max(strengths.get(key) ?? 0, strength.data));
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: [...strengths].map(([key, strength]) => ({ key, strength })) };
}

function parseBoolean(raw: string): boolean | undefined {
  const value = raw.trim().toLowerCase();
  if (TRUE_WORDS.has(value)) return true;
  if (FALSE_WORDS.has(value)) return false;
  return undefined;
}

function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
