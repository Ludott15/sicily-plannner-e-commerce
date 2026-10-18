-- Ricerca interna del sito (passo 11.2): estensioni, configurazione di testo, indici, funzione di
-- ricerca, tabella delle ricerche senza risultati con RLS e grant.
-- Non è una migrazione generata da drizzle-kit: si applica come file SQL idempotente. La tabella
-- search_misses ha il suo schema Drizzle in src/server/db/schema/search.ts.
--
-- Le estensioni stanno nello schema `extensions`, come in Supabase. Gli indici di espressione
-- usano le stesse espressioni della funzione search_site: se si cambia una, si cambia anche l'altra.

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Configurazione italiana con gli accenti tolti prima dello stemming: "Cefalù" e "Cefalu" coincidono.
do $$
begin
  if not exists (
    select 1 from pg_ts_config c
    join pg_namespace n on n.oid = c.cfgnamespace
    where n.nspname = 'public' and c.cfgname = 'isula_it'
  ) then
    create text search configuration public.isula_it (copy = pg_catalog.italian);
  end if;
end
$$;
alter text search configuration public.isula_it
  alter mapping for hword, hword_part, word with extensions.unaccent, italian_stem;

-- Versione immutabile di unaccent, necessaria per gli indici trigram di espressione.
create or replace function public.f_unaccent(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_text)
$$;

----------------------------------------------------------------------------
-- Indici di espressione. Ogni indice copia il predicato della sua funzione di ricerca
-- (is_active, pubblicazione) così il planner li usa solo dove il pubblico li vede.
----------------------------------------------------------------------------
create index if not exists places_search_fts_idx
  on public.places using gin (to_tsvector('public.isula_it', name || ' ' || coalesce(tagline_it, '')))
  where is_active;
create index if not exists places_search_trgm_idx
  on public.places using gin ((public.f_unaccent(lower(name))) extensions.gin_trgm_ops)
  where is_active;

create index if not exists activities_search_fts_idx
  on public.activities using gin (to_tsvector('public.isula_it', title || ' ' || coalesce(title_en, '')))
  where is_active;
create index if not exists activities_search_trgm_idx
  on public.activities using gin ((public.f_unaccent(lower(title))) extensions.gin_trgm_ops)
  where is_active;

create index if not exists itineraries_search_fts_idx
  on public.itineraries using gin (to_tsvector('public.isula_it', title || ' ' || coalesce(subtitle, '')))
  where is_template and slug is not null;
create index if not exists itineraries_search_trgm_idx
  on public.itineraries using gin ((public.f_unaccent(lower(title))) extensions.gin_trgm_ops)
  where is_template and slug is not null;

create index if not exists guides_search_fts_idx
  on public.guides using gin (
    to_tsvector('public.isula_it', title_it || ' ' || coalesce(title_en, '') || ' ' || coalesce(summary_it, ''))
  )
  where status = 'published';
create index if not exists guides_search_trgm_idx
  on public.guides using gin ((public.f_unaccent(lower(title_it))) extensions.gin_trgm_ops)
  where status = 'published';

create index if not exists products_search_fts_idx
  on public.products using gin (to_tsvector('public.isula_it', title))
  where is_active;
create index if not exists products_search_trgm_idx
  on public.products using gin ((public.f_unaccent(lower(title))) extensions.gin_trgm_ops)
  where is_active;

----------------------------------------------------------------------------
-- Ricerca. Ruolo del chiamante (SECURITY INVOKER): per il pubblico passa da dbPublic, quindi la
-- RLS decide cosa si trova. Query normalizzata: spazi compressi, massimo 100 caratteri, sotto 2
-- caratteri nessun risultato. Corrispondenza se la ricerca full text trova il testo oppure se il
-- titolo, senza accenti e in minuscolo, è simile alla query (tolleranza agli errori di battitura).
-- Punteggio: rango full text più similarità del titolo. Al massimo p_limit risultati per tipo.
----------------------------------------------------------------------------
create or replace function public.search_site(p_query text, p_locale text, p_limit int default 5)
returns table (kind text, slug text, title text, subtitle text, rank real)
language plpgsql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_raw text;
  v_norm text;
  v_tsq tsquery;
  v_limit int;
  v_en boolean;
begin
  v_raw := btrim(left(btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g')), 100));
  if char_length(v_raw) < 2 then
    return;
  end if;

  v_norm := public.f_unaccent(lower(v_raw));
  v_tsq := websearch_to_tsquery('public.isula_it', v_raw);
  v_limit := least(greatest(coalesce(p_limit, 5), 1), 20);
  v_en := p_locale = 'en';

  return query
  select u.kind, u.slug, u.title, u.subtitle, u.score
  from (
    (
      select 'place'::text as kind, x.slug, x.title, x.subtitle, x.score
      from (
        select
          p.slug,
          p.name as title,
          p.province::text as subtitle,
          (ts_rank(to_tsvector('public.isula_it', p.name || ' ' || coalesce(p.tagline_it, '')), v_tsq)
            + extensions.similarity(public.f_unaccent(lower(p.name)), v_norm))::real as score
        from public.places p
        where p.is_active
          and (
            to_tsvector('public.isula_it', p.name || ' ' || coalesce(p.tagline_it, '')) @@ v_tsq
            or public.f_unaccent(lower(p.name)) operator(extensions.%) v_norm
          )
      ) x
      order by x.score desc, x.title
      limit v_limit
    )
    union all
    (
      select 'activity'::text as kind, x.slug, x.title, x.subtitle, x.score
      from (
        select
          a.slug,
          case when v_en and a.title_en is not null then a.title_en else a.title end as title,
          pl.name as subtitle,
          (ts_rank(to_tsvector('public.isula_it', a.title || ' ' || coalesce(a.title_en, '')), v_tsq)
            + extensions.similarity(public.f_unaccent(lower(a.title)), v_norm))::real as score
        from public.activities a
        join public.places pl on pl.id = a.place_id and pl.is_active
        where a.is_active
          and (
            to_tsvector('public.isula_it', a.title || ' ' || coalesce(a.title_en, '')) @@ v_tsq
            or public.f_unaccent(lower(a.title)) operator(extensions.%) v_norm
          )
      ) x
      order by x.score desc, x.title
      limit v_limit
    )
    union all
    (
      select 'itinerary'::text as kind, x.slug, x.title, x.subtitle, x.score
      from (
        select
          i.slug,
          i.title,
          i.days::text as subtitle,
          (ts_rank(to_tsvector('public.isula_it', i.title || ' ' || coalesce(i.subtitle, '')), v_tsq)
            + extensions.similarity(public.f_unaccent(lower(i.title)), v_norm))::real as score
        from public.itineraries i
        where i.is_template and i.slug is not null
          and (
            to_tsvector('public.isula_it', i.title || ' ' || coalesce(i.subtitle, '')) @@ v_tsq
            or public.f_unaccent(lower(i.title)) operator(extensions.%) v_norm
          )
      ) x
      order by x.score desc, x.title
      limit v_limit
    )
    union all
    (
      select 'guide'::text as kind, x.slug, x.title, x.subtitle, x.score
      from (
        select
          g.slug,
          case when v_en and g.title_en is not null then g.title_en else g.title_it end as title,
          g.author_name as subtitle,
          (ts_rank(
              to_tsvector('public.isula_it', g.title_it || ' ' || coalesce(g.title_en, '') || ' ' || coalesce(g.summary_it, '')),
              v_tsq
            ) + extensions.similarity(public.f_unaccent(lower(g.title_it)), v_norm))::real as score
        from public.guides g
        where g.status = 'published'
          and (
            to_tsvector('public.isula_it', g.title_it || ' ' || coalesce(g.title_en, '') || ' ' || coalesce(g.summary_it, '')) @@ v_tsq
            or public.f_unaccent(lower(g.title_it)) operator(extensions.%) v_norm
          )
      ) x
      order by x.score desc, x.title
      limit v_limit
    )
    union all
    (
      select 'product'::text as kind, x.slug, x.title, x.subtitle, x.score
      from (
        select
          pr.slug,
          pr.title,
          null::text as subtitle,
          (ts_rank(to_tsvector('public.isula_it', pr.title), v_tsq)
            + extensions.similarity(public.f_unaccent(lower(pr.title)), v_norm))::real as score
        from public.products pr
        where pr.is_active
          and (
            to_tsvector('public.isula_it', pr.title) @@ v_tsq
            or public.f_unaccent(lower(pr.title)) operator(extensions.%) v_norm
          )
      ) x
      order by x.score desc, x.title
      limit v_limit
    )
  ) u
  order by array_position(array['place', 'activity', 'itinerary', 'guide', 'product']::text[], u.kind), u.score desc;
end;
$$;

revoke all on function public.search_site(text, text, int) from public;
grant execute on function public.search_site(text, text, int) to anon, authenticated;

----------------------------------------------------------------------------
-- Ricerche senza risultati. Una riga per frase normalizzata, con il numero di volte: nessun utente,
-- nessun IP, nessun timestamp per richiesta. Solo l'admin legge la tabella; la scrittura passa da
-- record_search_miss (SECURITY DEFINER), che anon e authenticated possono chiamare.
----------------------------------------------------------------------------
-- La tabella la crea la migrazione Drizzle 20261016172021_search.sql; qui RLS, grant e funzione.

alter table public.search_misses enable row level security;
revoke all on table public.search_misses from anon, authenticated;
grant select on table public.search_misses to authenticated;

drop policy if exists search_misses_select_admin on public.search_misses;
create policy search_misses_select_admin on public.search_misses
  for select to authenticated
  using ((select public.is_admin()));

create or replace function public.record_search_miss(p_query text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_norm text;
begin
  v_norm := btrim(left(btrim(regexp_replace(
    public.f_unaccent(lower(left(coalesce(p_query, ''), 200))), '\s+', ' ', 'g')), 100));
  if char_length(v_norm) < 2 then
    return;
  end if;

  insert into public.search_misses as m (query_norm, misses, first_seen, last_seen)
  values (v_norm, 1, now(), now())
  on conflict (query_norm) do update
    set misses = m.misses + 1,
        last_seen = excluded.last_seen;
end;
$$;

revoke all on function public.record_search_miss(text) from public;
grant execute on function public.record_search_miss(text) to anon, authenticated;
