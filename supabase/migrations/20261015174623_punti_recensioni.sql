CREATE TABLE "point_rules" (
	"reason" "point_reason" PRIMARY KEY NOT NULL,
	"delta" integer NOT NULL,
	CONSTRAINT "point_rules_delta_positive" CHECK ("point_rules"."delta" > 0)
);
--> statement-breakpoint
CREATE TABLE "review_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_reports_review_reporter_unique" UNIQUE("review_id","reporter_id"),
	CONSTRAINT "review_reports_reason_valid" CHECK ("review_reports"."reason" in ('spam', 'offensive', 'off_topic', 'other'))
);
--> statement-breakpoint
ALTER TABLE "check_ins" DROP CONSTRAINT "check_ins_lat_range";--> statement-breakpoint
ALTER TABLE "check_ins" DROP CONSTRAINT "check_ins_lng_range";--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "hidden_by" uuid;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reporter_id_profiles_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_by_profiles_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" DROP COLUMN "lat";--> statement-breakpoint
ALTER TABLE "check_ins" DROP COLUMN "lng";--> statement-breakpoint

-- Passo 5.1: punti, check-in e recensioni. SQL non generabile da Drizzle, da accodare alla
-- migrazione generata dallo schema (che crea point_rules e review_reports, aggiunge
-- reviews.updated_at, hidden_at, hidden_by e toglie check_ins.lat e lng).
-- Tutte le funzioni SECURITY DEFINER fissano search_path = public, pg_temp.
-- Errori di dominio: P0001 con codice snake_case; mancata autenticazione: 42501.
-- Le soglie qui sono letterali: devono coincidere con src/server/gamification/config.ts.

----------------------------------------------------------------------------
-- DATI INIZIALI: point_rules
----------------------------------------------------------------------------

insert into public.point_rules (reason, delta) values
  ('profile_completed', 50),
  ('invite_accepted', 100),
  ('itinerary_completed', 100),
  ('review', 20),
  ('check_in', 10)
on conflict (reason) do nothing;

-- Colonne tolte dallo schema: la posizione dell'utente non si salva mai.
alter table public.check_ins drop column if exists lat, drop column if exists lng;

----------------------------------------------------------------------------
-- RLS E GRANT: point_rules, review_reports, reviews
----------------------------------------------------------------------------

alter table public.point_rules enable row level security;
alter table public.review_reports enable row level security;

revoke all on table public.point_rules, public.review_reports from anon, authenticated;

-- Regole dei punti: leggibili da tutti (anche dalla home), nessuna scrittura dal client.
grant select on table public.point_rules to anon, authenticated;

create policy point_rules_select_all on public.point_rules
  for select to anon, authenticated
  using (true);

-- Segnalazioni: solo l'admin le legge; si creano con report_review.
grant select on table public.review_reports to authenticated;

create policy review_reports_select_admin on public.review_reports
  for select to authenticated
  using ((select public.is_admin()));

-- Recensioni: niente insert né update diretti (passano da submit_review, che verifica
-- l'idoneità e accredita i punti). Il proprietario legge e cancella le proprie.
drop policy if exists reviews_insert_own on public.reviews;
drop policy if exists reviews_update_own on public.reviews;

revoke insert (user_id, activity_id, rating, body), update (rating, body) on table public.reviews
  from authenticated;
revoke all on table public.reviews from anon, authenticated;
grant select, delete on table public.reviews to authenticated;

-- Una recensione nascosta dalla moderazione non si cancella: altrimenti l'autore la cancella,
-- le segnalazioni escono per cascade e la riscrive visibile.
drop policy if exists reviews_delete_own on public.reviews;
create policy reviews_delete_own on public.reviews
  for delete to authenticated
  using (user_id = (select auth.uid()) and hidden_at is null);

----------------------------------------------------------------------------
-- FUNZIONI DI SUPPORTO
----------------------------------------------------------------------------

-- Punti di un'azione dalla tabella point_rules (solo dalle funzioni SECURITY DEFINER).
create or replace function public.point_delta(p_reason public.point_reason)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_delta integer;
begin
  select pr.delta into v_delta from public.point_rules pr where pr.reason = p_reason;
  if v_delta is null then
    raise exception 'point_rule_missing' using errcode = 'P0001';
  end if;
  return v_delta;
end;
$$;

revoke all on function public.point_delta(public.point_reason) from public, anon, authenticated;

-- Idoneità a recensire: l'attività è in un itinerario che l'utente può modificare (proprio o di
-- un gruppo di cui è membro; mai un modello) oppure l'utente l'ha aperta da un link di
-- affiliazione. Ospiti e sconosciuti: false.
create or replace function public.review_eligible(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)
    and (
      exists (
        select 1
        from public.itinerary_items ii
        join public.itineraries i on i.id = ii.itinerary_id
        where ii.activity_id = p_activity_id
          and not i.is_template
          and public.can_edit_itinerary(i.id)
      )
      or exists (
        select 1
        from public.affiliate_clicks c
        where c.activity_id = p_activity_id
          and c.user_id = auth.uid()
      )
    );
$$;

revoke all on function public.review_eligible(uuid) from public, anon;
grant execute on function public.review_eligible(uuid) to authenticated;

----------------------------------------------------------------------------
-- PUNTI PER PROFILO E INVITO
----------------------------------------------------------------------------

-- Chiamata da saveAnswers, nella stessa transazione in cui si segna l'onboarding completato.
-- Accredita il profilo completato (una volta) e, per ogni invito da cui l'utente è entrato, il
-- punteggio di chi ha invitato (una volta per invitato). Un ospite non accumula punti.
create or replace function public.claim_onboarding_points()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_inviter uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.onboarding_completed_at is not null
  ) then
    return;
  end if;
  if exists (select 1 from auth.users u where u.id = v_uid and u.is_anonymous) then
    return;
  end if;

  perform public.award_points(v_uid, public.point_delta('profile_completed'), 'profile_completed', 'profile', v_uid);

  for v_inviter in
    select distinct gm.invited_by
    from public.group_members gm
    where gm.user_id = v_uid and gm.invited_by is not null and gm.invited_by <> v_uid
  loop
    perform public.award_points(v_inviter, public.point_delta('invite_accepted'), 'invite_accepted', 'invite', v_uid);
  end loop;
end;
$$;

revoke all on function public.claim_onboarding_points() from public, anon;
grant execute on function public.claim_onboarding_points() to authenticated;

-- Ingresso con invito (come nella migrazione gruppi_inviti) più il punteggio dell'autore
-- dell'invito, una volta per invitato, se l'invitato ha già completato l'onboarding.
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.group_invites;
  v_members integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.group_invites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;
  -- Già membro: si torna al gruppo anche con un invito scaduto, revocato o esaurito (nessun uso contato).
  if exists (
    select 1 from public.group_members
    where group_id = v_invite.group_id and user_id = v_uid
  ) then
    return v_invite.group_id;
  end if;
  if v_invite.status = 'revoked' then
    raise exception 'invite_revoked' using errcode = 'P0001';
  end if;
  if v_invite.status = 'expired' or v_invite.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    raise exception 'invite_exhausted' using errcode = 'P0001';
  end if;

  perform 1 from public.groups where id = v_invite.group_id for update;
  select count(*)::integer into v_members
  from public.group_members
  where group_id = v_invite.group_id;
  if v_members >= 30 then
    raise exception 'group_full' using errcode = 'P0001';
  end if;

  insert into public.group_members (group_id, user_id, role, invited_by)
  values (v_invite.group_id, v_uid, 'member', v_invite.invited_by);

  update public.group_invites set uses = uses + 1 where id = v_invite.id;

  if v_invite.invited_by <> v_uid and exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.onboarding_completed_at is not null
  ) then
    perform public.award_points(v_invite.invited_by, public.point_delta('invite_accepted'), 'invite_accepted', 'invite', v_uid);
  end if;

  return v_invite.group_id;
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

----------------------------------------------------------------------------
-- CHECK-IN
----------------------------------------------------------------------------

-- Check-in su una tappa di un itinerario che l'utente può modificare. Ordine dei controlli:
-- autenticazione, ospite, coordinate, tappa (not_allowed), luogo (no_place), distanza (too_far,
-- 300 m), già fatto oggi (already_checked_in), sesto del giorno (daily_limit). Il premio del
-- check-in vale per ogni luogo; quello dell'itinerario una sola volta, con 3 luoghi distinti.
-- La posizione serve solo alla distanza e non viene salvata.
create or replace function public.record_check_in(
  p_itinerary_item_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_itinerary_id uuid;
  v_place_id uuid;
  v_place_lat double precision;
  v_place_lng double precision;
  v_distance double precision;
  v_count integer;
  v_check_in_id uuid;
  v_delta integer;
  v_places integer;
  v_completed boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;
  if p_lat is null or p_lng is null
    or p_lat not between -90 and 90
    or p_lng not between -180 and 180 then
    raise exception 'invalid_position' using errcode = 'P0001';
  end if;

  select ii.itinerary_id, coalesce(ii.place_id, a.place_id)
    into v_itinerary_id, v_place_id
  from public.itinerary_items ii
  join public.itineraries i on i.id = ii.itinerary_id
  left join public.activities a on a.id = ii.activity_id
  where ii.id = p_itinerary_item_id
    and not i.is_template;

  if not found or not public.can_edit_itinerary(v_itinerary_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_place_id is null then
    raise exception 'no_place' using errcode = 'P0001';
  end if;

  select p.lat, p.lng into v_place_lat, v_place_lng
  from public.places p
  where p.id = v_place_id;

  -- Distanza sulla sfera (haversine), raggio terrestre 6371 km: soglia 300 m.
  v_distance := 2 * 6371000 * asin(sqrt(least(1,
    power(sin(radians(p_lat - v_place_lat) / 2), 2)
    + cos(radians(p_lat)) * cos(radians(v_place_lat)) * power(sin(radians(p_lng - v_place_lng) / 2), 2)
  )));
  if v_distance > 300 then
    raise exception 'too_far' using errcode = 'P0001';
  end if;

  -- Serializza i check-in dello stesso utente nello stesso giorno (limite e duplicati).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_today::text, 0));

  if exists (
    select 1 from public.check_ins c
    where c.user_id = v_uid and c.place_id = v_place_id and c.local_date = v_today
  ) then
    raise exception 'already_checked_in' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_count
  from public.check_ins c
  where c.user_id = v_uid and c.local_date = v_today;
  if v_count >= 5 then
    raise exception 'daily_limit' using errcode = 'P0001';
  end if;

  insert into public.check_ins (user_id, place_id, itinerary_id, local_date)
  values (v_uid, v_place_id, v_itinerary_id, v_today)
  on conflict (user_id, place_id, local_date) do nothing
  returning id into v_check_in_id;

  if v_check_in_id is null then
    raise exception 'already_checked_in' using errcode = 'P0001';
  end if;

  v_delta := public.point_delta('check_in');
  perform public.award_points(v_uid, v_delta, 'check_in', 'check_in', v_check_in_id);

  select count(distinct ci.place_id)::integer into v_places
  from public.check_ins ci
  where ci.user_id = v_uid and ci.itinerary_id = v_itinerary_id;

  if v_places >= 3 then
    v_completed := public.award_points(
      v_uid, public.point_delta('itinerary_completed'), 'itinerary_completed', 'itinerary', v_itinerary_id
    );
  end if;

  return jsonb_build_object(
    'checkInId', v_check_in_id,
    'points', v_delta,
    'itineraryCompleted', v_completed
  );
end;
$$;

revoke all on function public.record_check_in(uuid, double precision, double precision) from public, anon;
grant execute on function public.record_check_in(uuid, double precision, double precision) to authenticated;

----------------------------------------------------------------------------
-- RECENSIONI
----------------------------------------------------------------------------

-- Scrive o aggiorna la propria recensione di un'attività attiva per cui l'utente è idoneo.
-- Testo di almeno 80 caratteri: premio di 20 punti, una volta per attività (ref = attività):
-- cancellare e riscrivere non riaccredita. La recensione nascosta resta nascosta.
create or replace function public.submit_review(p_activity_id uuid, p_rating smallint, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := nullif(btrim(p_text), '');
  v_review_id uuid;
  v_rewarded boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_text, '')) > 4000 then
    raise exception 'invalid_text' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.activities a
    where a.id = p_activity_id and a.is_active
  ) then
    raise exception 'activity_not_available' using errcode = 'P0001';
  end if;
  if not public.review_eligible(p_activity_id) then
    raise exception 'not_eligible' using errcode = 'P0001';
  end if;

  insert into public.reviews (user_id, activity_id, rating, body, created_at, updated_at)
  values (v_uid, p_activity_id, p_rating, v_body, now(), now())
  on conflict (user_id, activity_id) do update set
    rating = excluded.rating,
    body = excluded.body,
    updated_at = now()
  returning id into v_review_id;

  if char_length(coalesce(v_body, '')) >= 80 then
    perform public.award_points(v_uid, public.point_delta('review'), 'review', 'review', p_activity_id);
  end if;

  v_rewarded := exists (
    select 1 from public.points_ledger l
    where l.user_id = v_uid and l.reason = 'review' and l.ref_id = p_activity_id
  );

  return jsonb_build_object('reviewId', v_review_id, 'rewarded', v_rewarded);
end;
$$;

revoke all on function public.submit_review(uuid, smallint, text) from public, anon;
grant execute on function public.submit_review(uuid, smallint, text) to authenticated;

-- Segnalazione di una recensione altrui. Una per utente e recensione: la seconda non fa nulla.
create or replace function public.report_review(p_review_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('spam', 'offensive', 'off_topic', 'other') then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;

  select r.user_id into v_owner from public.reviews r where r.id = p_review_id;
  if not found then
    raise exception 'review_not_found' using errcode = 'P0001';
  end if;
  if v_owner = v_uid then
    raise exception 'cannot_report_own' using errcode = 'P0001';
  end if;

  insert into public.review_reports (review_id, reporter_id, reason)
  values (p_review_id, v_uid, p_reason)
  on conflict (review_id, reporter_id) do nothing;
end;
$$;

revoke all on function public.report_review(uuid, text) from public, anon;
grant execute on function public.report_review(uuid, text) to authenticated;

-- Vista pubblica delle recensioni: senza user_id, senza quelle nascoste, con il flag rewarded
-- (la recensione ha ricevuto il premio). Il flag si calcola con il ruolo del proprietario della
-- vista e restituisce solo un booleano.
drop view if exists public.public_reviews;

create view public.public_reviews
with (security_barrier = true)
as
select
  r.id,
  r.activity_id,
  r.rating,
  r.body,
  r.created_at,
  p.display_name,
  p.avatar_url,
  exists (
    select 1 from public.points_ledger l
    where l.user_id = r.user_id and l.reason = 'review' and l.ref_id = r.activity_id
  ) as rewarded
from public.reviews r
join public.activities a on a.id = r.activity_id and a.is_active
join public.profiles p on p.id = r.user_id
where r.hidden_at is null;

revoke all on public.public_reviews from anon, authenticated;
grant select on public.public_reviews to anon, authenticated;
