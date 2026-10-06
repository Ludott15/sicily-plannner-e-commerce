-- Immagini del catalogo: RLS di media e image_authorizations, funzioni di visibilità,
-- bucket "media" e policy su storage.objects (docs/IMMAGINI.md).
--
-- Regole:
-- - image_authorizations: nessun accesso dai ruoli dell'API (anon, authenticated, admin
--   compreso). Le legge e scrive solo il server (dbAdmin) dopo requireAdmin.
-- - media: in lettura il pubblico vede solo i media "pubblici" (usabili e copertina di
--   un'entità pubblicata), con le sole colonne di didascalia e rendering; l'admin li vede
--   tutti. Nessuna scrittura dai ruoli dell'API: la fa il server.
-- - storage.objects nel bucket media: lettura pubblica solo delle varianti correnti dei
--   media pubblici (mai l'originale né i caricamenti in attesa); lettura e scrittura
--   complete solo per l'admin.

----------------------------------------------------------------------------
-- updated_at di media
----------------------------------------------------------------------------
create or replace function public.media_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger media_touch_updated_at
  before update on public.media
  for each row execute function public.media_touch_updated_at();

----------------------------------------------------------------------------
-- Usabilità e visibilità
----------------------------------------------------------------------------

-- Un media è usabile se ha il testo alternativo italiano, autore e licenza (foto), le
-- varianti generate (foto) e, se ritrae un bene culturale, un'autorizzazione non scaduta.
-- Un media non usabile è "bloccato": le pagine passano all'anello successivo della catena
-- di ripiego. SECURITY DEFINER perché legge image_authorizations, chiusa all'API.
create or replace function public.media_is_usable(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.media m
    left join public.image_authorizations a on a.id = m.authorization_id
    where m.id = p_media_id
      and nullif(btrim(m.alt_it), '') is not null
      and (
        m.kind = 'illustration'
        or (
          nullif(btrim(m.author), '') is not null
          and nullif(btrim(m.license), '') is not null
          and m.variants_version > 0
        )
      )
      and (not m.heritage_asset or (a.id is not null and a.valid_until >= current_date))
  );
$$;

-- Pubblico = usabile e copertina di almeno un'entità pubblicata, con le stesse condizioni
-- che la RLS applica agli anonimi: luoghi e aree sempre, attività attive, itinerari pronti
-- (template con slug).
create or replace function public.media_is_public(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.media_is_usable(p_media_id) and (
    exists (select 1 from public.places where cover_media_id = p_media_id)
    or exists (select 1 from public.areas where cover_media_id = p_media_id)
    or exists (select 1 from public.activities where cover_media_id = p_media_id and is_active)
    or exists (
      select 1 from public.itineraries
      where cover_media_id = p_media_id and is_template and slug is not null
    )
  );
$$;

-- Un file del bucket è pubblico solo se è una variante della versione corrente di un media
-- pubblico (foto) o il file stesso di un'illustrazione pubblica. L'originale ripulito
-- (master) e i caricamenti in attesa (incoming/) non lo sono mai.
create or replace function public.media_object_is_public(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.media m
    where m.id::text = split_part(p_name, '/', 1)
      and (
        (
          m.kind = 'photo'
          and m.variants_version > 0
          and p_name ~ ('^' || m.id::text || '/v' || m.variants_version::text || '/(4x5|16x9|1x1)-[0-9]+\.(avif|webp)$')
        )
        or (m.kind = 'illustration' and p_name = m.storage_path)
      )
      and public.media_is_public(m.id)
  );
$$;

revoke all on function public.media_is_usable(uuid) from public;
revoke all on function public.media_is_public(uuid) from public;
revoke all on function public.media_object_is_public(text) from public;
grant execute on function public.media_is_usable(uuid) to anon, authenticated;
grant execute on function public.media_is_public(uuid) to anon, authenticated;
grant execute on function public.media_object_is_public(text) to anon, authenticated;

----------------------------------------------------------------------------
-- image_authorizations: chiusa all'API
----------------------------------------------------------------------------
alter table public.image_authorizations enable row level security;
revoke all on table public.image_authorizations from anon, authenticated;

----------------------------------------------------------------------------
-- media
----------------------------------------------------------------------------
alter table public.media enable row level security;
revoke all on table public.media from anon, authenticated;

-- Colonne pubbliche: rendering (percorso, misure, punto focale, segnaposto, versione) e
-- didascalia. Restano escluse source_url (interna), heritage_asset, authorization_id,
-- original_filename, created_by e le date.
grant select (
  id, storage_path, width, height, focal_x, focal_y, alt_it, alt_en, kind, source_type,
  author, author_url, license, license_url, source_link, modified, credit_text,
  blur_data_url, variants_version
) on table public.media to anon, authenticated;

create policy media_select_public on public.media
  for select to anon, authenticated
  using (public.media_is_public(id));

create policy media_select_admin on public.media
  for select to authenticated
  using ((select public.is_admin()));

----------------------------------------------------------------------------
-- Bucket e storage.objects
----------------------------------------------------------------------------
-- Privato: i file passano dalla route /api/media, che li chiede allo storage con il ruolo
-- del visitatore, quindi con queste policy. Limiti del bucket come seconda difesa: la
-- validazione vera (tipo dal contenuto, lato lungo minimo) la fa il server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy media_objects_select_public on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'media' and public.media_object_is_public(name));

create policy media_objects_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));

create policy media_objects_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_admin()));

create policy media_objects_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (select public.is_admin()))
  with check (bucket_id = 'media' and (select public.is_admin()));

create policy media_objects_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));
