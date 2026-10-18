-- Builder (1.4): note per giorno, link pubblico in sola lettura.
-- Va dopo la migrazione generata da Drizzle che crea la colonna itineraries.day_notes, i suoi
-- check e la tabella itinerary_share_links (con l'indice parziale unico e il check del token).

----------------------------------------------------------------------------
-- NOTE PER GIORNO
----------------------------------------------------------------------------
-- Stessi grant di day_titles (insert e update), nessun grant aggiuntivo in lettura:
-- la select di tabella su itineraries (20260927203432) copre già la colonna.
grant insert (day_notes) on table public.itineraries to authenticated;
grant update (day_notes) on table public.itineraries to authenticated;

----------------------------------------------------------------------------
-- LINK PUBBLICO: RLS E GRANT
----------------------------------------------------------------------------
-- Il client non legge né scrive mai token_hash: lettura e scrittura passano dai grant di colonna.
-- Nessuna policy per anon: il link pubblico si legge solo con public.shared_itinerary.

grant select (id, itinerary_id, created_at, revoked_at) on table public.itinerary_share_links to authenticated;
grant insert (itinerary_id, token_hash, created_by) on table public.itinerary_share_links to authenticated;
grant update (revoked_at) on table public.itinerary_share_links to authenticated;

-- Lettura: proprietario, membro del gruppo collegato, admin sui template (can_edit_itinerary).
create policy itinerary_share_links_select on public.itinerary_share_links
  for select to authenticated
  using (public.can_edit_itinerary(itinerary_id));

-- Creazione: chi può modificare l'itinerario, e solo a suo nome.
create policy itinerary_share_links_insert on public.itinerary_share_links
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.can_edit_itinerary(itinerary_id)
  );

-- Revoca: solo un link ancora attivo, e solo verso lo stato revocato. Un link revocato non si
-- riattiva mai con un update (il token è già noto a chi lo aveva: si rigenera).
create policy itinerary_share_links_revoke on public.itinerary_share_links
  for update to authenticated
  using (
    revoked_at is null
    and public.can_edit_itinerary(itinerary_id)
  )
  with check (
    revoked_at is not null
    and public.can_edit_itinerary(itinerary_id)
  );

----------------------------------------------------------------------------
-- LETTURA PUBBLICA DEL LINK
----------------------------------------------------------------------------
-- Dato il token in chiaro restituisce l'itinerario in sola lettura, oppure null se il token non
-- esiste o il link è revocato. Non espone mai owner_id, email, prenotazioni o gruppo.
-- Le tappe di attività inattive o luoghi inattivi non compaiono (come nelle policy di lettura).
-- Il token non si sa indovinare: si cerca per hash SHA-256, come invite_preview.
create or replace function public.shared_itinerary(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'title', i.title,
    'days', i.days,
    'start_date', i.start_date,
    'travelers', i.travelers,
    'day_titles', to_jsonb(i.day_titles),
    'day_notes', to_jsonb(i.day_notes),
    'stops', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'day_index', s.day_index,
          'position', s.position,
          'time_slot', s.time_slot,
          'notes', s.notes,
          'title', s.title,
          'activity_slug', s.activity_slug,
          'place_name', s.place_name
        )
        order by s.day_index, s.position
      )
      from (
        select
          ii.day_index,
          ii.position,
          ii.time_slot,
          ii.notes,
          coalesce(a.title, p.name, ii.custom_title) as title,
          a.slug as activity_slug,
          p.name as place_name
        from public.itinerary_items ii
        left join public.activities a on a.id = ii.activity_id
        left join public.places p on p.id = coalesce(ii.place_id, a.place_id)
        where ii.itinerary_id = i.id
          and (ii.activity_id is null or a.is_active)
          and (coalesce(ii.place_id, a.place_id) is null or p.is_active)
      ) s
    ), '[]'::jsonb)
  )
  from public.itinerary_share_links l
  join public.itineraries i on i.id = l.itinerary_id
  where l.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and l.revoked_at is null;
$$;

revoke all on function public.shared_itinerary(text) from public;
grant execute on function public.shared_itinerary(text) to anon, authenticated;
