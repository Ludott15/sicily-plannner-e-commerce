// Controllo di lancio sul database di produzione (e2e/launch.spec.ts, PRE_LAUNCH=1): nessun
// dato demo del seed né di test. È un file .mjs importato con import() dinamico, come e2e/db.mjs.
// LAUNCH_DATABASE_URL: connessione al database di produzione (basta un ruolo in sola lettura).
import postgres from "postgres";

// Prefissi dei dati che non devono esistere in produzione: "demo-" e "[DEMO]" (seed), "e2e-" e
// "int-" (test). Si guardano slug, titoli, testi e codici dei partner.
const PREFIXES = ["demo-%", "e2e-%", "int-%", "[DEMO]%"];

export async function demoRowCounts(databaseUrl) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const [row] = await sql`
      select
        (select count(*)::int from public.activities
          where slug like any(${PREFIXES}) or title like any(${PREFIXES}) or description like any(${PREFIXES})) as activities,
        (select count(*)::int from public.places
          where slug like any(${PREFIXES}) or name like any(${PREFIXES}) or description like any(${PREFIXES})) as places,
        (select count(*)::int from public.itineraries
          where slug like any(${PREFIXES}) or title like any(${PREFIXES})) as itineraries,
        (select count(*)::int from public.local_tips where body like any(${PREFIXES})) as local_tips,
        (select count(*)::int from public.local_tip_authors where display_name like any(${PREFIXES})) as local_tip_authors,
        (select count(*)::int from public.activity_offers
          where partner_product_id like any(${PREFIXES}) or title like any(${PREFIXES})) as activity_offers,
        (select count(*)::int from public.media
          where original_filename like any(${PREFIXES}) or alt_it like any(${PREFIXES}) or author like any(${PREFIXES})) as media`;
    return row;
  } finally {
    await sql.end();
  }
}

// Controlli di lancio sulle immagini (docs/IMMAGINI.md). Ogni voce è l'elenco di ciò che non
// va (slug o id), vuoto se tutto è a posto:
// - featuredWithoutPhoto: luoghi in evidenza senza una foto vera propria e usabile;
// - itinerariesWithoutPhoto: itinerari pubblicati la cui catena (propria → luogo della prima
//   tappa) non arriva a una foto vera usabile;
// - publicMediaWithoutAlt: media usati da entità pubblicate senza testo alternativo italiano;
// - licensedWithoutCredit: foto con licenza senza autore o licenza;
// - heritageWithoutAuthorization: beni culturali senza autorizzazione valida (scaduta o assente);
// - placesWithoutPhoto: luoghi senza una foto vera propria e usabile (le attività senza foto
//   propria mostrano quella del luogo, quindi così ogni card ha una foto vera);
// - areasWithoutCover, placesWithoutArea: l'ultimo anello della catena di ripiego (foto o
//   illustrazione dell'area: nessuna pagina deve restare senza immagine).
export async function imageLaunchProblems(databaseUrl) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const [row] = await sql`
      with usable_photo as (
        select id from public.media where kind = 'photo' and public.media_is_usable(id)
      ),
      published_media as (
        select cover_media_id as id from public.places where cover_media_id is not null
        union select cover_media_id from public.areas where cover_media_id is not null
        union select cover_media_id from public.activities where cover_media_id is not null and is_active
        union select cover_media_id from public.itineraries
          where cover_media_id is not null and is_template and slug is not null
      )
      select
        array(
          select p.slug from public.places p
          where p.is_featured
            and not exists (select 1 from usable_photo u where u.id = p.cover_media_id)
          order by p.slug
        ) as "featuredWithoutPhoto",
        array(
          select i.slug from public.itineraries i
          left join lateral (
            select coalesce(ii.place_id, a.place_id) as place_id
            from public.itinerary_items ii left join public.activities a on a.id = ii.activity_id
            where ii.itinerary_id = i.id order by ii.day_index, ii.position limit 1
          ) first_stop on true
          left join public.places fp on fp.id = first_stop.place_id
          where i.is_template and i.slug is not null
            and not exists (select 1 from usable_photo u where u.id = i.cover_media_id)
            and not exists (select 1 from usable_photo u where u.id = fp.cover_media_id)
          order by i.slug
        ) as "itinerariesWithoutPhoto",
        array(
          select m.id::text from public.media m join published_media pm on pm.id = m.id
          where nullif(btrim(m.alt_it), '') is null order by m.id
        ) as "publicMediaWithoutAlt",
        array(
          select m.id::text from public.media m
          where m.source_type = 'licensed'
            and (nullif(btrim(m.author), '') is null or nullif(btrim(m.license), '') is null)
          order by m.id
        ) as "licensedWithoutCredit",
        array(
          select m.id::text from public.media m
          left join public.image_authorizations a on a.id = m.authorization_id
          where m.heritage_asset and (a.id is null or a.valid_until < current_date)
          order by m.id
        ) as "heritageWithoutAuthorization",
        array(
          select p.slug from public.places p
          where not exists (select 1 from usable_photo u where u.id = p.cover_media_id)
          order by p.slug
        ) as "placesWithoutPhoto",
        array(
          select ar.slug from public.areas ar
          where not exists (
            select 1 from public.media m where m.id = ar.cover_media_id and public.media_is_usable(m.id)
          )
          order by ar.sort
        ) as "areasWithoutCover",
        array(select p.slug from public.places p where p.area_id is null order by p.slug) as "placesWithoutArea"`;
    return row;
  } finally {
    await sql.end();
  }
}
