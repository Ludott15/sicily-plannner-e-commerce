-- Catalogo dello shop (passo 7.1): RLS, grant per colonna, funzioni, trigger, visibilità delle
-- copertine e ricerca. Tabelle e colonne sono in src/server/db/schema/shop.ts (migrazione
-- Drizzle generata a parte); questo file va come migrazione custom (`npm run db:generate -- --custom`)
-- dopo quella Drizzle. Non modifica migrazioni già committate: ridefinisce con `create or replace`
-- le funzioni già esistenti (media_is_public, search_site) con lo stesso nome e firma.

----------------------------------------------------------------------------
-- FUNZIONE: un prodotto è vendibile se è attivo, il suo produttore è pubblico e attivo, il
-- fornitore è attivo. Il fornitore non è leggibile dai client: la condizione passa da qui.
-- SECURITY DEFINER: legge suppliers e producers senza grant ai client; restituisce solo un booleano.
----------------------------------------------------------------------------
create or replace function public.product_is_sellable(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.products p
    join public.producers pr on pr.id = p.producer_id
    join public.suppliers s on s.id = p.supplier_id
    where p.id = p_product_id
      and p.is_active
      and pr.is_public
      and pr.is_active
      and s.is_active
  );
$$;

revoke all on function public.product_is_sellable(uuid) from public;
grant execute on function public.product_is_sellable(uuid) to anon, authenticated;

----------------------------------------------------------------------------
-- suppliers: solo admin. Nessun grant ad anon; authenticated solo per le policy admin.
----------------------------------------------------------------------------
alter table public.suppliers enable row level security;
revoke all on table public.suppliers from anon, authenticated;
grant select, insert, update, delete on table public.suppliers to authenticated;

create policy suppliers_select_admin on public.suppliers
  for select to authenticated
  using ((select public.is_admin()));

create policy suppliers_insert_admin on public.suppliers
  for insert to authenticated
  with check ((select public.is_admin()));

create policy suppliers_update_admin on public.suppliers
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy suppliers_delete_admin on public.suppliers
  for delete to authenticated
  using ((select public.is_admin()));

----------------------------------------------------------------------------
-- producers: pubblici se is_public e is_active. Email, partita IVA e indirizzo non hanno grant
-- ai client (li legge l'admin con dbAdmin). L'admin via authenticated legge solo le colonne pubbliche.
----------------------------------------------------------------------------
revoke all on table public.producers from anon, authenticated;
grant select (
  id, slug, name, story_it, story_en, area_id, place_id, cover_media_id, is_public, is_active, created_at
) on table public.producers to anon, authenticated;
grant insert, update, delete on table public.producers to authenticated;

create policy producers_select_public on public.producers
  for select to anon, authenticated
  using (is_public and is_active);

----------------------------------------------------------------------------
-- products: vendibili (product_is_sellable) per tutti; l'admin vede tutto. Colonne concesse:
-- niente costo, codice del fornitore, id del fornitore, prezzo Stripe, colonna images (non usata).
----------------------------------------------------------------------------
drop policy if exists products_select_active_anon on public.products;
drop policy if exists products_select_active_or_admin on public.products;

revoke all on table public.products from anon, authenticated;
grant select (
  id, slug, producer_id, title, title_en, description, description_en, category, format_label,
  price_cents, vat_rate, weight_g, ingredients_it, ingredients_en, allergens, allergens_declared, storage_it, storage_en,
  min_shelf_life_days, is_perishable, stock_status, lead_time_days, area_id, place_id,
  cover_media_id, is_box, is_active, created_at
) on table public.products to anon, authenticated;
grant insert, update, delete on table public.products to authenticated;

create policy products_select_sellable on public.products
  for select to anon, authenticated
  using (is_active and public.product_is_sellable(id));

create policy products_select_admin on public.products
  for select to authenticated
  using ((select public.is_admin()));

----------------------------------------------------------------------------
-- Galleria, collegamenti e box: visibili con il prodotto (o l'admin). Nessun dato interno.
----------------------------------------------------------------------------
alter table public.product_media enable row level security;
alter table public.product_links enable row level security;
alter table public.box_items enable row level security;
revoke all on table public.product_media, public.product_links, public.box_items from anon, authenticated;

grant select on table public.product_media, public.product_links, public.box_items to anon, authenticated;
grant insert, update, delete on table public.product_media, public.product_links, public.box_items to authenticated;

create policy product_media_select on public.product_media
  for select to anon, authenticated
  using (public.product_is_sellable(product_id) or (select public.is_admin()));

create policy product_media_write_admin on public.product_media
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy product_links_select on public.product_links
  for select to anon, authenticated
  using (
    (select public.is_admin())
    or (
      public.product_is_sellable(product_id)
      and (
        (kind = 'place' and exists (select 1 from public.places pl where pl.id = target_id and pl.is_active))
        or (kind = 'activity' and exists (select 1 from public.activities a where a.id = target_id and a.is_active))
      )
    )
  );

create policy product_links_write_admin on public.product_links
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy box_items_select on public.box_items
  for select to anon, authenticated
  using (
    (select public.is_admin())
    or (public.product_is_sellable(box_id) and public.product_is_sellable(product_id))
  );

create policy box_items_write_admin on public.box_items
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

----------------------------------------------------------------------------
-- Trigger di coerenza
----------------------------------------------------------------------------

-- Un collegamento punta a un luogo o a un'attività che esistono (target_id non ha foreign key).
create or replace function public.product_links_check_target()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'place' and not exists (select 1 from public.places where id = new.target_id) then
    raise exception 'product_link_target_missing' using errcode = 'P0001';
  end if;
  if new.kind = 'activity' and not exists (select 1 from public.activities where id = new.target_id) then
    raise exception 'product_link_target_missing' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists product_links_target_exists on public.product_links;
create trigger product_links_target_exists
  before insert or update on public.product_links
  for each row execute function public.product_links_check_target();

-- La composizione di una box si lega solo a prodotti marcati come box.
create or replace function public.box_items_check_box()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.products where id = new.box_id and is_box) then
    raise exception 'box_not_box' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists box_items_box_is_box on public.box_items;
create trigger box_items_box_is_box
  before insert or update on public.box_items
  for each row execute function public.box_items_check_box();

----------------------------------------------------------------------------
-- media_is_public: le copertine di produttori e prodotti vendibili, e le foto della galleria,
-- diventano pubbliche. Stessa firma e grant di 20261014110156; cambia solo il ramo dello shop.
----------------------------------------------------------------------------
create or replace function public.media_is_public(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.media_is_usable(p_media_id) and (
    exists (select 1 from public.places where cover_media_id = p_media_id and is_active)
    or exists (select 1 from public.areas where cover_media_id = p_media_id)
    or exists (select 1 from public.activities where cover_media_id = p_media_id and is_active)
    or exists (
      select 1 from public.itineraries
      where cover_media_id = p_media_id and is_template and slug is not null
    )
    or exists (
      select 1 from public.producers
      where cover_media_id = p_media_id and is_public and is_active
    )
    or exists (
      select 1 from public.products
      where cover_media_id = p_media_id and public.product_is_sellable(id)
    )
    or exists (
      select 1 from public.product_media pm
      where pm.media_id = p_media_id and public.product_is_sellable(pm.product_id)
    )
  );
$$;

revoke all on function public.media_is_public(uuid) from public;
grant execute on function public.media_is_public(uuid) to anon, authenticated;

----------------------------------------------------------------------------
-- search_site: stessa firma e grant di 20261016172029. Il ramo dei prodotti ora ha un href
-- (/prodotti/<slug>) e il sottotitolo è il nome del produttore pubblico; i prodotti non vendibili
-- non compaiono. Le espressioni di ricerca restano quelle degli indici (products_search_*).
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
          case when v_en and pr.title_en is not null then pr.title_en else pr.title end as title,
          pm.name as subtitle,
          (ts_rank(to_tsvector('public.isula_it', pr.title), v_tsq)
            + extensions.similarity(public.f_unaccent(lower(pr.title)), v_norm))::real as score
        from public.products pr
        join public.producers pm on pm.id = pr.producer_id
        where public.product_is_sellable(pr.id)
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
