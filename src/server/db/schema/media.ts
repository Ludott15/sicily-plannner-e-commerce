import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { mediaKind, mediaSourceType } from "./enums";
import { profiles } from "./profiles";

// Autorizzazioni alla riproduzione di beni culturali in consegna a un ente pubblico (parco
// archeologico, museo, monumento: artt. 107-108 del Codice dei beni culturali, docs/IMMAGINI.md).
// Una stessa autorizzazione copre più immagini. Solo admin: non esce mai nelle pagine pubbliche.
export const imageAuthorizations = pgTable(
  "image_authorizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authority: text("authority").notNull(),
    reference: text("reference").notNull(),
    issuedOn: date("issued_on").notNull(),
    // Obbligatoria: un'immagine di bene culturale è usabile solo fino a questa data compresa.
    validUntil: date("valid_until").notNull(),
    scope: text("scope").notNull(),
    documentUrl: text("document_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("image_authorizations_dates", sql`${t.validUntil} >= ${t.issuedOn}`),
    check("image_authorizations_document_url_https", sql`${t.documentUrl} ~ '^https://'`),
    check("image_authorizations_authority_length", sql`char_length(btrim(${t.authority})) between 1 and 200`),
    check("image_authorizations_reference_length", sql`char_length(btrim(${t.reference})) between 1 and 200`),
  ],
);

// Didascalia generata: "Foto: autore, licenza" (con "modificata" se ritagliata o ridotta) o
// "Illustrazione di Isula". Le pagine compongono la didascalia dai campi (con i link e la
// lingua); credit_text è la versione testuale per l'admin e gli export.
const creditText: SQL = sql`case
  when kind = 'illustration' then 'Illustrazione di Isula'
  else 'Foto: ' || coalesce(nullif(btrim(author), ''), '?') || coalesce(', ' || nullif(btrim(license), ''), '')
    || case when modified then ' (modificata)' else '' end
end`;

// Immagini del catalogo (foto vere o illustrazioni). File nel bucket privato "media":
//   {id}/master.{jpg,png,webp}   originale ripulito (EXIF e GPS rimossi), mai pubblico
//   {id}/v{n}/{ratio}-{w}.{avif,webp}   varianti ritagliate sul punto focale (versione n)
//   {id}/illustration.svg        illustrazioni vettoriali (nessuna variante)
// Un file è leggibile dal pubblico solo se il media è usabile e copertina di un'entità
// pubblicata (public.media_object_is_public, policy su storage.objects).
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storagePath: text("storage_path").notNull().unique(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    // Punto focale in coordinate relative (0..1), scelto con un clic nell'admin.
    focalX: doublePrecision("focal_x").notNull().default(0.5),
    focalY: doublePrecision("focal_y").notNull().default(0.5),
    altIt: text("alt_it"),
    altEn: text("alt_en"),
    kind: mediaKind("kind").notNull(),
    sourceType: mediaSourceType("source_type").notNull(),
    author: text("author"),
    authorUrl: text("author_url"),
    license: text("license"),
    licenseUrl: text("license_url"),
    // Pagina di provenienza: interna (admin). Il pubblico vede solo source_link, cioè la pagina
    // del file su Wikimedia Commons, che la licenza chiede di citare.
    sourceUrl: text("source_url"),
    sourceLink: text("source_link").generatedAlwaysAs(
      sql`case when source_url ~ '^https://commons\\.wikimedia\\.org/' then source_url end`,
    ),
    accessedAt: date("accessed_at"),
    modified: boolean("modified").notNull().default(false),
    creditText: text("credit_text").generatedAlwaysAs(creditText),
    heritageAsset: boolean("heritage_asset").notNull().default(false),
    authorizationId: uuid("authorization_id").references(() => imageAuthorizations.id, { onDelete: "restrict" }),
    // Segnaposto sfocato (data URL WebP di pochi byte), mostrato mentre la variante carica.
    blurDataUrl: text("blur_data_url"),
    // Versione delle varianti (cambia a ogni nuovo punto focale); 0 = nessuna (SVG).
    variantsVersion: integer("variants_version").notNull().default(0),
    originalFilename: text("original_filename"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("media_authorization_id_idx").on(t.authorizationId),
    check("media_dimensions_positive", sql`${t.width} > 0 and ${t.height} > 0`),
    check("media_focal_range", sql`${t.focalX} between 0 and 1 and ${t.focalY} between 0 and 1`),
    check("media_kind_matches_source", sql`(${t.kind} = 'illustration') = (${t.sourceType} = 'illustration')`),
    check("media_authorization_only_heritage", sql`${t.authorizationId} is null or ${t.heritageAsset}`),
    check("media_storage_path_format", sql`${t.storagePath} ~ '^[0-9a-f-]{36}/(master\\.(jpg|png|webp)|illustration\\.svg)$'`),
    check("media_author_url_http", sql`${t.authorUrl} ~ '^https?://'`),
    check("media_license_url_http", sql`${t.licenseUrl} ~ '^https?://'`),
    check("media_source_url_https", sql`${t.sourceUrl} ~ '^https://'`),
    check("media_variants_version_non_negative", sql`${t.variantsVersion} >= 0`),
  ],
);
