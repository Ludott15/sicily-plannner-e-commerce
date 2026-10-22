import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/server/auth";
import { dbAdmin } from "@/server/db/admin";
import { imageAuthorizations, media } from "@/server/db/schema";

// Letture dell'admin delle immagini (dbAdmin: vede anche i media non pubblici e i campi
// interni come source_url e le autorizzazioni).

export type MediaProblem =
  | "missing_alt"
  | "missing_author_license"
  | "heritage_without_authorization"
  | "authorization_expired"
  | "no_variants";

type ProblemInput = {
  kind: "photo" | "illustration";
  altIt: string | null;
  author: string | null;
  license: string | null;
  heritageAsset: boolean;
  authorizationId: string | null;
  authorizationValidUntil: string | null;
  variantsVersion: number;
};

// Stesse regole di public.media_is_usable: un media con problemi è bloccato e le pagine
// usano l'anello successivo della catena di ripiego.
export function mediaProblems(m: ProblemInput, todayIso: string): MediaProblem[] {
  const problems: MediaProblem[] = [];
  if (!m.altIt?.trim()) problems.push("missing_alt");
  if (m.kind === "photo" && (!m.author?.trim() || !m.license?.trim())) problems.push("missing_author_license");
  if (m.kind === "photo" && m.variantsVersion === 0) problems.push("no_variants");
  if (m.heritageAsset && !m.authorizationId) problems.push("heritage_without_authorization");
  if (m.heritageAsset && m.authorizationId && (m.authorizationValidUntil ?? "") < todayIso) problems.push("authorization_expired");
  return problems;
}

const usedBy = sql<Array<{ type: string; id: string; slug: string | null; name: string }>>`coalesce((
  select jsonb_agg(u order by u.type, u.name) from (
    select 'place' as type, p.id, p.slug, p.name from public.places p where p.cover_media_id = ${media.id}
    union all
    select 'activity', a.id, a.slug, a.title from public.activities a where a.cover_media_id = ${media.id}
    union all
    select 'itinerary', i.id, i.slug, i.title from public.itineraries i where i.cover_media_id = ${media.id}
    union all
    select 'area', ar.id, ar.slug, ar.name_it from public.areas ar where ar.cover_media_id = ${media.id}
  ) u
), '[]'::jsonb)`;

const mediaColumns = {
  id: media.id,
  storagePath: media.storagePath,
  width: media.width,
  height: media.height,
  focalX: media.focalX,
  focalY: media.focalY,
  altIt: media.altIt,
  altEn: media.altEn,
  kind: media.kind,
  sourceType: media.sourceType,
  author: media.author,
  authorUrl: media.authorUrl,
  license: media.license,
  licenseUrl: media.licenseUrl,
  sourceUrl: media.sourceUrl,
  accessedAt: media.accessedAt,
  modified: media.modified,
  creditText: media.creditText,
  heritageAsset: media.heritageAsset,
  authorizationId: media.authorizationId,
  authorizationValidUntil: imageAuthorizations.validUntil,
  blurDataUrl: media.blurDataUrl,
  variantsVersion: media.variantsVersion,
  originalFilename: media.originalFilename,
  createdAt: media.createdAt,
  usable: sql<boolean>`public.media_is_usable(${media.id})`,
  usedBy,
};

export type AdminMedia = Awaited<ReturnType<typeof listAdminMedia>>[number];

// "todo": i media bloccati (da completare); "all": tutti. I più recenti in alto.
export async function listAdminMedia(filter: "todo" | "all") {
  await requireAdmin();
  return dbAdmin
    .select(mediaColumns)
    .from(media)
    .leftJoin(imageAuthorizations, eq(imageAuthorizations.id, media.authorizationId))
    .where(filter === "todo" ? sql`not public.media_is_usable(${media.id})` : undefined)
    .orderBy(desc(media.createdAt))
    .limit(200);
}

export async function getAdminMedia(id: string) {
  await requireAdmin();
  const [row] = await dbAdmin
    .select(mediaColumns)
    .from(media)
    .leftJoin(imageAuthorizations, eq(imageAuthorizations.id, media.authorizationId))
    .where(eq(media.id, id));
  return row ?? null;
}

export async function listAuthorizations() {
  await requireAdmin();
  return dbAdmin
    .select({
      id: imageAuthorizations.id,
      authority: imageAuthorizations.authority,
      reference: imageAuthorizations.reference,
      issuedOn: imageAuthorizations.issuedOn,
      validUntil: imageAuthorizations.validUntil,
      scope: imageAuthorizations.scope,
      documentUrl: imageAuthorizations.documentUrl,
      mediaCount: sql<number>`(select count(*)::int from public.media m where m.authorization_id = ${imageAuthorizations.id})`,
    })
    .from(imageAuthorizations)
    .orderBy(asc(imageAuthorizations.validUntil), asc(imageAuthorizations.authority));
}

// Autorizzazioni che scadono entro N giorni (comprese quelle già scadute ancora collegate a
// immagini), con il numero di immagini che bloccheranno.
export async function expiringAuthorizations(days = 60) {
  const rows = await listAuthorizations();
  const limit = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  return rows.filter((r) => r.validUntil <= limit && (r.mediaCount > 0 || r.validUntil >= new Date().toISOString().slice(0, 10)));
}

// ---------------------------------------------------------------------------
// Copertura delle immagini del catalogo
// ---------------------------------------------------------------------------

// Per area e tipo di entità: quante hanno una foto vera propria, quante si appoggiano a una
// foto di ripiego (luogo, prima tappa), quante mostrano solo un'illustrazione (propria o
// dell'area) e quante niente (segnaposto). Si contano le entità pubblicate (attività attive,
// itinerari pronti) e i media usabili, come nelle pagine.
export type ImageCoverageRow = {
  areaId: string | null;
  entity: "place" | "activity" | "itinerary";
  photo: number;
  fallback: number;
  illustration: number;
  none: number;
};

export async function adminImageCoverage(): Promise<ImageCoverageRow[]> {
  await requireAdmin();
  const rows = await dbAdmin.execute<{
    area_id: string | null;
    entity: "place" | "activity" | "itinerary";
    photo: number;
    fallback: number;
    illustration: number;
    none: number;
  }>(sql`
    with um as (
      select id, kind from public.media where public.media_is_usable(id)
    ),
    place_status as (
      select p.id, p.area_id,
        own.kind as own_kind,
        (select um.kind from um join public.areas a on a.cover_media_id = um.id where a.id = p.area_id) as area_kind
      from public.places p
      left join um own on own.id = p.cover_media_id
    ),
    entities as (
      select 'place' as entity, ps.area_id,
        case when ps.own_kind = 'photo' then 'photo'
             when ps.own_kind is not null or ps.area_kind is not null then 'illustration'
             else 'none' end as status
      from place_status ps
      union all
      select 'activity', ps.area_id,
        case when own.kind = 'photo' then 'photo'
             when own.kind = 'illustration' then 'illustration'
             when ps.own_kind = 'photo' then 'fallback'
             when ps.own_kind is not null or ps.area_kind is not null then 'illustration'
             else 'none' end
      from public.activities a
      join place_status ps on ps.id = a.place_id
      left join um own on own.id = a.cover_media_id
      where a.is_active
      union all
      select 'itinerary', ps.area_id,
        case when own.kind = 'photo' then 'photo'
             when own.kind = 'illustration' then 'illustration'
             when ps.own_kind = 'photo' then 'fallback'
             when ps.own_kind is not null or ps.area_kind is not null then 'illustration'
             else 'none' end
      from public.itineraries i
      left join um own on own.id = i.cover_media_id
      left join lateral (
        select coalesce(ii.place_id, act.place_id) as place_id
        from public.itinerary_items ii
        left join public.activities act on act.id = ii.activity_id
        where ii.itinerary_id = i.id
        order by ii.day_index, ii.position
        limit 1
      ) first_stop on true
      left join place_status ps on ps.id = first_stop.place_id
      where i.is_template and i.slug is not null
    )
    select area_id, entity,
      count(*) filter (where status = 'photo')::int as photo,
      count(*) filter (where status = 'fallback')::int as fallback,
      count(*) filter (where status = 'illustration')::int as illustration,
      count(*) filter (where status = 'none')::int as none
    from entities
    group by area_id, entity
  `);
  return [...rows].map((r) => ({
    areaId: r.area_id,
    entity: r.entity,
    photo: r.photo,
    fallback: r.fallback,
    illustration: r.illustration,
    none: r.none,
  }));
}

// ---------------------------------------------------------------------------
// Entità senza una foto vera (foto da Commons)
// ---------------------------------------------------------------------------

export type PhotoNeed = {
  type: "area" | "place" | "activity" | "itinerary";
  id: string;
  slug: string | null;
  name: string;
  // Luogo di riferimento (attività e itinerari) e coordinate per la ricerca per posizione.
  placeName: string | null;
  lat: number | null;
  lng: number | null;
  // Cosa c'è oggi: niente, un media bloccato, un'illustrazione o un'immagine demo.
  current: "none" | "blocked" | "illustration" | "demo";
};

// Aree, luoghi, attività e itinerari pronti la cui copertina propria non è una foto vera
// usabile. Le immagini demo (nome file demo-…) contano come mancanti: sono segnaposto.
// Ordine: luoghi, attività, itinerari, aree (un'area senza una foto propria può riusare quella
// di uno dei suoi luoghi, quindi viene per ultima).
// Con only: quella sola entità, anche se ha già una foto (per sostituirla).
export async function entitiesNeedingPhoto(limit = 500, only?: { type: PhotoNeed["type"]; id: string }): Promise<PhotoNeed[]> {
  await requireAdmin();
  return listPhotoNeeds(limit, only);
}

// Stessa lettura senza controllo di accesso: la usano le azioni già verificate con requireAdmin e
// lo script locale npm run media:commons-fill (che non ha una sessione).
export async function listPhotoNeeds(limit = 500, only?: { type: PhotoNeed["type"]; id: string }): Promise<PhotoNeed[]> {
  const rows = await dbAdmin.execute<{
    type: PhotoNeed["type"];
    id: string;
    slug: string | null;
    name: string;
    place_name: string | null;
    lat: number | null;
    lng: number | null;
    current: PhotoNeed["current"];
  }>(sql`
    with cover as (
      select m.id,
        case
          when coalesce(m.original_filename, '') like 'demo-%' then 'demo'
          when not public.media_is_usable(m.id) then 'blocked'
          when m.kind = 'illustration' then 'illustration'
          else 'photo'
        end as status
      from public.media m
    ),
    entities as (
      select 4 as ord, 'area' as type, a.id, a.slug, a.name_it as name, null::text as place_name,
        (select avg(p.lat) from public.places p where p.area_id = a.id) as lat,
        (select avg(p.lng) from public.places p where p.area_id = a.id) as lng,
        a.cover_media_id
      from public.areas a
      union all
      select 1, 'place', p.id, p.slug, p.name, null, p.lat, p.lng, p.cover_media_id from public.places p
      union all
      select 2, 'activity', a.id, a.slug, a.title, p.name, p.lat, p.lng, a.cover_media_id
      from public.activities a join public.places p on p.id = a.place_id
      union all
      select 3, 'itinerary', i.id, i.slug, i.title, fp.name, fp.lat, fp.lng, i.cover_media_id
      from public.itineraries i
      left join lateral (
        select coalesce(ii.place_id, act.place_id) as place_id
        from public.itinerary_items ii left join public.activities act on act.id = ii.activity_id
        where ii.itinerary_id = i.id order by ii.day_index, ii.position limit 1
      ) first_stop on true
      left join public.places fp on fp.id = first_stop.place_id
      where i.is_template
    )
    select e.type, e.id, e.slug, e.name, e.place_name, e.lat::float8 as lat, e.lng::float8 as lng,
      coalesce(c.status, 'none') as current
    from entities e left join cover c on c.id = e.cover_media_id
    where ${only ? sql`e.type = ${only.type} and e.id = ${only.id}::uuid` : sql`coalesce(c.status, 'none') <> 'photo'`}
    order by e.ord, e.name
    limit ${limit}
  `);
  return [...rows].map((r) => ({
    type: r.type,
    id: r.id,
    slug: r.slug,
    name: r.name,
    placeName: r.place_name,
    lat: r.lat,
    lng: r.lng,
    current: r.current,
  }));
}

// Pagine di Commons già importate: la ricerca non ripropone la stessa foto per due entità.
export async function importedCommonsPages(): Promise<Set<string>> {
  await requireAdmin();
  return listImportedCommonsPages();
}

// Come importedCommonsPages, senza controllo di accesso (vedi listPhotoNeeds).
export async function listImportedCommonsPages(): Promise<Set<string>> {
  const rows = await dbAdmin
    .select({ sourceUrl: media.sourceUrl })
    .from(media)
    .where(sql`${media.sourceUrl} like 'https://commons.wikimedia.org/%'`);
  return new Set(rows.flatMap((r) => (r.sourceUrl ? [r.sourceUrl] : [])));
}
