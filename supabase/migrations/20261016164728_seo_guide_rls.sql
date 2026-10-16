-- Guide editoriali (passo 11.1): RLS e grant delle tabelle guides e guide_links, che lo schema
-- Drizzle crea (src/server/db/schema/guides.ts). Il pubblico (anon e utenti, ospiti compresi)
-- legge solo le guide pubblicate; l'admin vede le bozze e scrive. Le letture pubbliche passano
-- da dbPublic; l'admin scrive con dbAdmin, ma la RLS resta la seconda difesa.

alter table public.guides enable row level security;
alter table public.guide_links enable row level security;

revoke all on table public.guides, public.guide_links from anon, authenticated;
grant select on table public.guides, public.guide_links to anon, authenticated;
-- Scritture dell'admin: solo le colonne che il form usa. La RLS limita comunque all'admin.
grant insert (id, slug, title_it, title_en, summary_it, summary_en, body_it, body_en,
              author_name, cover_media_id, status, published_at)
  on table public.guides to authenticated;
grant update (slug, title_it, title_en, summary_it, summary_en, body_it, body_en,
              author_name, cover_media_id, status, published_at, updated_at)
  on table public.guides to authenticated;
grant delete on table public.guides to authenticated;
grant insert (guide_id, kind, target_id, position) on table public.guide_links to authenticated;
grant update (position) on table public.guide_links to authenticated;
grant delete on table public.guide_links to authenticated;

-- Pubblico: solo le guide pubblicate. Niente is_admin qui: la funzione non è concessa ad anon.
create policy guides_select_published on public.guides
  for select to anon, authenticated
  using (status = 'published');

-- Admin: anche le bozze.
create policy guides_select_admin on public.guides
  for select to authenticated
  using ((select public.is_admin()));

create policy guides_insert_admin on public.guides
  for insert to authenticated
  with check ((select public.is_admin()));

create policy guides_update_admin on public.guides
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy guides_delete_admin on public.guides
  for delete to authenticated
  using ((select public.is_admin()));

-- I collegamenti seguono la guida: visibili solo se la guida è pubblicata.
create policy guide_links_select_published on public.guide_links
  for select to anon, authenticated
  using (exists (
    select 1 from public.guides g
    where g.id = guide_links.guide_id and g.status = 'published'
  ));

create policy guide_links_select_admin on public.guide_links
  for select to authenticated
  using ((select public.is_admin()));

create policy guide_links_insert_admin on public.guide_links
  for insert to authenticated
  with check ((select public.is_admin()));

create policy guide_links_update_admin on public.guide_links
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy guide_links_delete_admin on public.guide_links
  for delete to authenticated
  using ((select public.is_admin()));

-- Descrizioni delle aree (passo 11.1): le colonne nuove ereditano il grant di update esistente su
-- areas (20261006112033_areas.sql); la policy areas_update_admin lo riserva all'admin.
