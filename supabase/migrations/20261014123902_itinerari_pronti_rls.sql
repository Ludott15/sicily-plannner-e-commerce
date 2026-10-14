-- Itinerari pronti (1.3): grant per colonna sui campi editoriali nuovi e su time_slot,
-- RLS e grant di itinerary_nights.
-- La select di tabella su itineraries e itinerary_items (migrazione 20260927203432) copre già
-- le colonne nuove: nessun grant aggiuntivo in lettura.

-- Campi editoriali di itineraries: stessi grant di title e day_titles (insert e update).
-- I template li scrive l'admin dal server con dbAdmin; la policy itineraries_* resta invariata.
grant insert (subtitle, description, season_months, suitable_for, pace, day_intros)
  on table public.itineraries to authenticated;
grant update (subtitle, description, season_months, suitable_for, pace, day_intros)
  on table public.itineraries to authenticated;

-- Ora indicativa della tappa: stessi grant di notes (insert e update).
grant insert (time_slot) on table public.itinerary_items to authenticated;
grant update (time_slot) on table public.itinerary_items to authenticated;

-- Notti: come itinerary_items. Lettura a chi vede l'itinerario; scrittura solo a chi lo può modificare
-- (proprietario, membro del gruppo collegato, admin sui template: lo copre can_edit_itinerary).
alter table public.itinerary_nights enable row level security;

revoke all on table public.itinerary_nights from anon, authenticated;
grant select on table public.itinerary_nights to anon, authenticated;
grant insert (itinerary_id, night_index, area_id, place_id) on table public.itinerary_nights to authenticated;
grant update (area_id, place_id) on table public.itinerary_nights to authenticated;
grant delete on table public.itinerary_nights to authenticated;

create policy itinerary_nights_select on public.itinerary_nights
  for select to anon, authenticated
  using (public.can_access_itinerary(itinerary_id));

create policy itinerary_nights_insert on public.itinerary_nights
  for insert to authenticated
  with check (public.can_edit_itinerary(itinerary_id));

create policy itinerary_nights_update on public.itinerary_nights
  for update to authenticated
  using (public.can_edit_itinerary(itinerary_id))
  with check (public.can_edit_itinerary(itinerary_id));

create policy itinerary_nights_delete on public.itinerary_nights
  for delete to authenticated
  using (public.can_edit_itinerary(itinerary_id));
