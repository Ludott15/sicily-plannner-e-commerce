import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { CoverMedia } from "@/lib/media";

// Media di copertina come JSON, letto con il ruolo della query (dbPublic: anon). La RLS di
// media fa passare solo i media pubblici, quindi un media bloccato o non pubblicato diventa
// null e la catena di ripiego (src/lib/media.ts) passa all'anello successivo.
// Solo colonne concesse ad anon: niente source_url né dati delle autorizzazioni.
export function coverJson(mediaId: SQL | SQL.Aliased | unknown): SQL<CoverMedia | null> {
  return sql<CoverMedia | null>`(
    select jsonb_build_object(
      'id', m.id, 'storagePath', m.storage_path, 'width', m.width, 'height', m.height,
      'focalX', m.focal_x, 'focalY', m.focal_y, 'altIt', m.alt_it, 'altEn', m.alt_en, 'kind', m.kind,
      'author', m.author, 'authorUrl', m.author_url, 'license', m.license, 'licenseUrl', m.license_url,
      'modified', m.modified, 'blurDataUrl', m.blur_data_url, 'variantsVersion', m.variants_version
    )
    from public.media m where m.id = ${mediaId}
  )`;
}

// Copertina dell'area di un luogo (colonna place_id o espressione).
export function areaCoverJson(placeAreaId: SQL | unknown): SQL<CoverMedia | null> {
  return coverJson(sql`(select a.cover_media_id from public.areas a where a.id = ${placeAreaId})`);
}
