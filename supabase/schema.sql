


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."booking_kind" AS ENUM (
    'activity',
    'lodging',
    'car',
    'flight'
);


ALTER TYPE "public"."booking_kind" OWNER TO "postgres";


CREATE TYPE "public"."booking_status" AS ENUM (
    'to_book',
    'booked'
);


ALTER TYPE "public"."booking_status" OWNER TO "postgres";


CREATE TYPE "public"."car_access" AS ENUM (
    'own',
    'rental',
    'none'
);


ALTER TYPE "public"."car_access" OWNER TO "postgres";


CREATE TYPE "public"."event_type" AS ENUM (
    'view',
    'save',
    'unsave',
    'add_to_itinerary',
    'remove_from_itinerary',
    'affiliate_click',
    'vote_up',
    'vote_down',
    'review'
);


ALTER TYPE "public"."event_type" OWNER TO "postgres";


CREATE TYPE "public"."group_role" AS ENUM (
    'owner',
    'member'
);


ALTER TYPE "public"."group_role" OWNER TO "postgres";


CREATE TYPE "public"."invite_status" AS ENUM (
    'active',
    'revoked',
    'expired'
);


ALTER TYPE "public"."invite_status" OWNER TO "postgres";


CREATE TYPE "public"."itinerary_status" AS ENUM (
    'draft',
    'planned',
    'in_progress',
    'completed'
);


ALTER TYPE "public"."itinerary_status" OWNER TO "postgres";


CREATE TYPE "public"."local_tip_author_kind" AS ENUM (
    'editorial',
    'person'
);


ALTER TYPE "public"."local_tip_author_kind" OWNER TO "postgres";


CREATE TYPE "public"."media_kind" AS ENUM (
    'photo',
    'illustration'
);


ALTER TYPE "public"."media_kind" OWNER TO "postgres";


CREATE TYPE "public"."media_source_type" AS ENUM (
    'own',
    'licensed',
    'partner',
    'illustration'
);


ALTER TYPE "public"."media_source_type" OWNER TO "postgres";


CREATE TYPE "public"."order_status" AS ENUM (
    'pending',
    'paid',
    'sent_to_producer',
    'shipped',
    'delivered',
    'cancelled',
    'refunded'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."partner" AS ENUM (
    'travelpayouts',
    'getyourguide',
    'viator',
    'car_rental',
    'internal'
);


ALTER TYPE "public"."partner" OWNER TO "postgres";


CREATE TYPE "public"."point_reason" AS ENUM (
    'profile_completed',
    'invite_accepted',
    'review',
    'check_in',
    'itinerary_completed',
    'order',
    'redeem',
    'redeem_refund',
    'admin_adjust'
);


ALTER TYPE "public"."point_reason" OWNER TO "postgres";


CREATE TYPE "public"."travel_party" AS ENUM (
    'solo',
    'couple',
    'family',
    'friends'
);


ALTER TYPE "public"."travel_party" OWNER TO "postgres";


CREATE TYPE "public"."trip_pace" AS ENUM (
    'relaxed',
    'balanced',
    'intense'
);


ALTER TYPE "public"."trip_pace" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_invite"("p_token" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_invite public.group_invites;
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
  if v_invite.status = 'revoked' then
    raise exception 'invite_revoked' using errcode = 'P0001';
  end if;
  if v_invite.status = 'expired' or v_invite.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    raise exception 'invite_exhausted' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.group_members
    where group_id = v_invite.group_id and user_id = v_uid
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_uid, 'member');

  update public.group_invites set uses = uses + 1 where id = v_invite.id;

  return v_invite.group_id;
end;
$$;


ALTER FUNCTION "public"."accept_invite"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_audit_log_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op = 'UPDATE'
    and pg_trigger_depth() > 1
    and old.actor_id is not null
    and new.actor_id is null
    and (new.id, new.action, new.entity, new.entity_id, new.diff, new.created_at)
      is not distinct from (old.id, old.action, old.entity, old.entity_id, old.diff, old.created_at)
  then
    return new;
  end if;
  raise exception 'admin_audit_log_immutable' using errcode = 'P0001';
end;
$$;


ALTER FUNCTION "public"."admin_audit_log_immutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."affiliate_subid_param"("p_partner" "public"."partner") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case p_partner
    when 'getyourguide' then 'cmp'
    when 'viator' then 'campaign'
    when 'travelpayouts' then 'sub_id'
    when 'car_rental' then 'subid'
    else null
  end
$$;


ALTER FUNCTION "public"."affiliate_subid_param"("p_partner" "public"."partner") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_points"("p_user_id" "uuid", "p_delta" integer, "p_reason" "public"."point_reason", "p_ref_type" "text", "p_ref_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_inserted integer;
begin
  if exists (select 1 from auth.users where id = p_user_id and is_anonymous) then
    return false;
  end if;

  insert into public.points_ledger (user_id, delta, reason, ref_type, ref_id, season)
  values (p_user_id, p_delta, p_reason, p_ref_type, p_ref_id, public.season_for(now()))
  on conflict on constraint points_ledger_user_reason_ref_unique do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;


ALTER FUNCTION "public"."award_points"("p_user_id" "uuid", "p_delta" integer, "p_reason" "public"."point_reason", "p_ref_type" "text", "p_ref_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_itinerary"("iid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.itineraries i
    where i.id = iid
      and (
        i.is_template
        or i.owner_id = auth.uid()
        or (i.group_id is not null and public.is_group_member(i.group_id))
      )
  );
$$;


ALTER FUNCTION "public"."can_access_itinerary"("iid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_itinerary"("iid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.itineraries i
    where i.id = iid
      and (
        i.owner_id = auth.uid()
        or (i.group_id is not null and public.is_group_member(i.group_id))
        or (i.is_template and public.is_admin())
      )
  );
$$;


ALTER FUNCTION "public"."can_edit_itinerary"("iid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_vote_item"("item_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.itinerary_items ii
    join public.itineraries i on i.id = ii.itinerary_id
    where ii.id = item_id
      and i.group_id is not null
      and public.is_group_member(i.group_id)
  );
$$;


ALTER FUNCTION "public"."can_vote_item"("item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_activity_has_tags"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_activity_id uuid;
begin
  if tg_table_name = 'activities' then
    v_activity_id := new.id;
  else
    v_activity_id := old.activity_id;
  end if;

  if exists (
    select 1 from public.activities a
    where a.id = v_activity_id
      and a.is_active
      and not exists (select 1 from public.activity_interests ai where ai.activity_id = a.id)
  ) then
    raise exception 'activity_without_tags' using errcode = 'P0001';
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."check_activity_has_tags"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_activity_place_active"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if exists (
    select 1
    from public.activities a
    join public.places p on p.id = a.place_id
    where a.id = new.id
      and a.is_active
      and not p.is_active
  ) then
    raise exception 'activity_place_inactive' using errcode = 'P0001';
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."check_activity_place_active"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_place_has_active_activities"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if exists (
    select 1
    from public.places p
    join public.activities a on a.place_id = p.id
    where p.id = new.id
      and not p.is_active
      and a.is_active
  ) then
    raise exception 'place_has_active_activities' using errcode = 'P0001';
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."check_place_has_active_activities"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_group"("p_name" "text", "p_itinerary_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;

  if p_itinerary_id is not null then
    perform 1 from public.itineraries
    where id = p_itinerary_id and owner_id = v_uid and group_id is null
    for update;
    if not found then
      raise exception 'itinerary_not_available' using errcode = 'P0001';
    end if;
  end if;

  insert into public.groups (name, owner_id, itinerary_id)
  values (p_name, v_uid, p_itinerary_id)
  returning id into v_group_id;

  if p_itinerary_id is not null then
    update public.itineraries set group_id = v_group_id where id = p_itinerary_id;
  end if;

  return v_group_id;
end;
$$;


ALTER FUNCTION "public"."create_group"("p_name" "text", "p_itinerary_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_inactive_guests"("p_days" integer DEFAULT 30) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_deleted integer;
begin
  if p_days < 1 then
    raise exception 'invalid_days' using errcode = 'P0001';
  end if;

  delete from auth.users u
  where u.is_anonymous
    and greatest(
      u.created_at,
      u.last_sign_in_at,
      u.updated_at,
      (
        select max(greatest(s.updated_at, s.refreshed_at at time zone 'UTC'))
        from auth.sessions s
        where s.user_id = u.id
      )
    ) < now() - make_interval(days => p_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


ALTER FUNCTION "public"."delete_inactive_guests"("p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."group_has_other_members"("gid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = gid and gm.user_id <> g.owner_id
  );
$$;


ALTER FUNCTION "public"."group_has_other_members"("gid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."group_leaderboard"("gid" "uuid") RETURNS TABLE("display_name" "text", "avatar_url" "text", "total_points" integer, "is_me" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    p.display_name,
    p.avatar_url,
    coalesce(sum(l.delta) filter (
      where l.reason not in ('redeem', 'redeem_refund')
        and i.start_date is not null
        and (l.created_at at time zone 'Europe/Rome')::date >= i.start_date
        and (l.created_at at time zone 'Europe/Rome')::date < i.start_date + i.days
    ), 0)::int as total_points,
    gm.user_id = auth.uid() as is_me
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  join public.profiles p on p.id = gm.user_id
  left join public.itineraries i on i.id = g.itinerary_id
  left join public.points_ledger l on l.user_id = gm.user_id
  where gm.group_id = gid
    and public.is_group_member(gid)
  group by gm.user_id, p.display_name, p.avatar_url
  order by total_points desc;
$$;


ALTER FUNCTION "public"."group_leaderboard"("gid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."groups_add_owner_member"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;


ALTER FUNCTION "public"."groups_add_owner_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_preview"("p_token" "text") RETURNS TABLE("group_id" "uuid", "group_name" "text", "owner_display_name" "text", "owner_avatar_url" "text", "itinerary_id" "uuid", "itinerary_title" "text", "itinerary_days" smallint, "expires_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select g.id, g.name, p.display_name, p.avatar_url, i.id, i.title, i.days, gi.expires_at
  from public.group_invites gi
  join public.groups g on g.id = gi.group_id
  join public.profiles p on p.id = g.owner_id
  left join public.itineraries i on i.id = g.itinerary_id
  where gi.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and gi.status = 'active'
    and gi.expires_at > now()
    and gi.uses < gi.max_uses;
$$;


ALTER FUNCTION "public"."invite_preview"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_member"("gid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_group_member"("gid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_owner"("gid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.groups
    where id = gid and owner_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_group_owner"("gid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."itinerary_bookings_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."itinerary_bookings_stamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."local_tip_authors_person_relation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.kind = 'person' and exists (
    select 1 from public.local_tips t
    where t.author_id = new.id and coalesce(btrim(t.author_relation), '') = ''
  ) then
    raise exception 'person_tip_without_relation' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."local_tip_authors_person_relation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."local_tips_person_relation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if exists (select 1 from public.local_tip_authors a where a.id = new.author_id and a.kind = 'person')
     and coalesce(btrim(new.author_relation), '') = '' then
    raise exception 'person_tip_without_relation' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."local_tips_person_relation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."media_is_public"("p_media_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.media_is_usable(p_media_id) and (
    exists (select 1 from public.places where cover_media_id = p_media_id and is_active)
    or exists (select 1 from public.areas where cover_media_id = p_media_id)
    or exists (select 1 from public.activities where cover_media_id = p_media_id and is_active)
    or exists (
      select 1 from public.itineraries
      where cover_media_id = p_media_id and is_template and slug is not null
    )
  );
$$;


ALTER FUNCTION "public"."media_is_public"("p_media_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."media_is_usable"("p_media_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."media_is_usable"("p_media_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."media_object_is_public"("p_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."media_object_is_public"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."media_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."media_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception '%_immutable', tg_table_name using errcode = 'P0001';
end;
$$;


ALTER FUNCTION "public"."prevent_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_affiliate_click"("p_offer_id" "uuid", "p_subid" "text", "p_context" "text", "p_anon_id" "text" DEFAULT NULL::"text", "p_itinerary_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_uid uuid := auth.uid();
  v_offer public.activity_offers;
  v_param text;
  v_target text;
begin
  select o.* into v_offer
  from public.activity_offers o
  join public.activities a on a.id = o.activity_id
  where o.id = p_offer_id and o.is_active and a.is_active;
  if not found then
    raise exception 'offer_not_bookable' using errcode = 'P0001';
  end if;

  if p_subid !~ '^[a-z0-9]{12,32}$' then
    raise exception 'invalid_subid' using errcode = 'P0001';
  end if;

  if p_anon_id is not null and p_anon_id !~ '^[0-9a-f-]{36}$' then
    raise exception 'invalid_anon_id' using errcode = 'P0001';
  end if;

  if p_itinerary_id is not null and not public.can_access_itinerary(p_itinerary_id) then
    raise exception 'itinerary_not_accessible' using errcode = 'P0001';
  end if;

  -- Il parametro si aggiunge in coda senza riscrivere l'URL di base; con un frammento (#)
  -- l'URL resta com'è.
  v_param := public.affiliate_subid_param(v_offer.partner);
  v_target := case
    when v_param is null or position('#' in v_offer.affiliate_url) > 0 then v_offer.affiliate_url
    when position('?' in v_offer.affiliate_url) > 0 then v_offer.affiliate_url || '&' || v_param || '=' || p_subid
    else v_offer.affiliate_url || '?' || v_param || '=' || p_subid
  end;

  insert into public.affiliate_clicks
    (user_id, activity_id, offer_id, partner, target_url, subid, context, itinerary_id, anon_id)
  values
    (v_uid, v_offer.activity_id, v_offer.id, v_offer.partner, v_target, p_subid, p_context, p_itinerary_id, p_anon_id);

  if v_uid is not null then
    insert into public.user_events (user_id, type, activity_id, itinerary_id)
    values (v_uid, 'affiliate_click', v_offer.activity_id, p_itinerary_id);
  end if;

  return v_target;
end;
$_$;


ALTER FUNCTION "public"."record_affiliate_click"("p_offer_id" "uuid", "p_subid" "text", "p_context" "text", "p_anon_id" "text", "p_itinerary_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_leaderboard"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  refresh materialized view concurrently public.leaderboard_season_totals;
$$;


ALTER FUNCTION "public"."refresh_leaderboard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."season_for"("ts" timestamp with time zone) RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when extract(month from ts at time zone 'Europe/Rome') between 4 and 9
      then extract(year from ts at time zone 'Europe/Rome')::int || '-estate'
    when extract(month from ts at time zone 'Europe/Rome') >= 10
      then extract(year from ts at time zone 'Europe/Rome')::int || '-inverno'
    else (extract(year from ts at time zone 'Europe/Rome')::int - 1) || '-inverno'
  end;
$$;


ALTER FUNCTION "public"."season_for"("ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_group_ownership"("p_group_id" "uuid", "p_new_owner" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_group public.groups;
begin
  select * into v_group from public.groups where id = p_group_id for update;
  if not found or v_group.owner_id is distinct from v_uid then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;

  if p_new_owner = v_uid or not exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = p_new_owner
  ) then
    raise exception 'new_owner_not_member' using errcode = 'P0001';
  end if;

  update public.groups set owner_id = p_new_owner where id = p_group_id;
  update public.group_members set role = 'member' where group_id = p_group_id and user_id = v_uid;
  update public.group_members set role = 'owner' where group_id = p_group_id and user_id = p_new_owner;
  update public.itineraries set owner_id = p_new_owner
  where id = v_group.itinerary_id and owner_id = v_uid;
end;
$$;


ALTER FUNCTION "public"."transfer_group_ownership"("p_group_id" "uuid", "p_new_owner" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "place_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "duration_min" integer NOT NULL,
    "requires_car" boolean DEFAULT false NOT NULL,
    "accessible" boolean DEFAULT false NOT NULL,
    "season_months" smallint[] DEFAULT '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[] NOT NULL,
    "rating" numeric(2,1),
    "embedding" "extensions"."vector"(1024),
    "is_active" boolean DEFAULT false NOT NULL,
    "synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "on_site_price_eur" numeric(8,2),
    "diet_friendly" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "cover_media_id" "uuid",
    "title_en" "text",
    "needs_review" boolean DEFAULT false NOT NULL,
    CONSTRAINT "activities_diet_friendly_valid" CHECK (("diet_friendly" <@ '{vegetarian,vegan,gluten_free,lactose_free}'::"text"[])),
    CONSTRAINT "activities_duration_positive" CHECK (("duration_min" > 0)),
    CONSTRAINT "activities_on_site_price_non_negative" CHECK (("on_site_price_eur" >= (0)::numeric)),
    CONSTRAINT "activities_rating_range" CHECK ((("rating" >= (0)::numeric) AND ("rating" <= (5)::numeric))),
    CONSTRAINT "activities_season_months_valid" CHECK (("season_months" <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[]))
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_interests" (
    "activity_id" "uuid" NOT NULL,
    "interest_key" "text" NOT NULL,
    "strength" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_interests_strength_range" CHECK ((("strength" >= 1) AND ("strength" <= 3)))
);


ALTER TABLE "public"."activity_interests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "partner" "public"."partner" NOT NULL,
    "partner_product_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "price_from_eur" numeric(8,2),
    "currency" character(3) DEFAULT 'EUR'::"bpchar" NOT NULL,
    "affiliate_url" "text" NOT NULL,
    "rating" numeric(2,1),
    "reviews_count" integer,
    "free_cancellation" boolean,
    "price_updated_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_offers_affiliate_url_https" CHECK (("affiliate_url" ~ '^https://'::"text")),
    CONSTRAINT "activity_offers_currency_format" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "activity_offers_partner_not_internal" CHECK (("partner" <> 'internal'::"public"."partner")),
    CONSTRAINT "activity_offers_price_non_negative" CHECK (("price_from_eur" >= (0)::numeric)),
    CONSTRAINT "activity_offers_rating_range" CHECK ((("rating" >= (0)::numeric) AND ("rating" <= (5)::numeric))),
    CONSTRAINT "activity_offers_reviews_count_non_negative" CHECK (("reviews_count" >= 0))
);


ALTER TABLE "public"."activity_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_sources" (
    "activity_id" "uuid" NOT NULL,
    "source_url" "text",
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_sources_notes_length" CHECK (("char_length"("notes") <= 2000)),
    CONSTRAINT "activity_sources_source_url_format" CHECK (("source_url" ~ '^https?://'::"text")),
    CONSTRAINT "activity_sources_source_url_length" CHECK (("char_length"("source_url") <= 2000))
);


ALTER TABLE "public"."activity_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_log" (
    "id" bigint NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "entity_id" "uuid",
    "diff" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."admin_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."admin_audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."admin_audit_log_id_seq" OWNED BY "public"."admin_audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."affiliate_clicks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "activity_id" "uuid",
    "partner" "public"."partner" NOT NULL,
    "target_url" "text" NOT NULL,
    "subid" "text" NOT NULL,
    "context" "text" NOT NULL,
    "itinerary_id" "uuid",
    "anon_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "offer_id" "uuid",
    CONSTRAINT "affiliate_clicks_context_valid" CHECK (("context" = ANY (ARRAY['page'::"text", 'itinerary'::"text", 'chat'::"text", 'flights'::"text"]))),
    CONSTRAINT "affiliate_clicks_target_url_https" CHECK (("target_url" ~ '^https://'::"text"))
);


ALTER TABLE "public"."affiliate_clicks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_conversions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "partner" "public"."partner" NOT NULL,
    "subid" "text" NOT NULL,
    "amount_eur" numeric(10,2),
    "commission_eur" numeric(10,2),
    "status" "text" NOT NULL,
    "reported_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."affiliate_conversions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name_it" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "sort" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cover_media_id" "uuid",
    CONSTRAINT "areas_slug_format" CHECK (("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text"))
);


ALTER TABLE "public"."areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."badges" (
    "key" "text" NOT NULL,
    "name_it" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "description" "text",
    "criteria" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "jsonb" NOT NULL,
    "tool_calls" "jsonb",
    "input_tokens" integer,
    "output_tokens" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_messages_role_valid" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'tool'::"text"]))),
    CONSTRAINT "chat_messages_tokens_non_negative" CHECK (((COALESCE("input_tokens", 0) >= 0) AND (COALESCE("output_tokens", 0) >= 0)))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "itinerary_id" "uuid",
    "title" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."check_ins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "place_id" "uuid" NOT NULL,
    "itinerary_id" "uuid",
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "local_date" "date" DEFAULT (("now"() AT TIME ZONE 'Europe/Rome'::"text"))::"date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_ins_lat_range" CHECK ((("lat" >= ('-90'::integer)::double precision) AND ("lat" <= (90)::double precision))),
    CONSTRAINT "check_ins_lng_range" CHECK ((("lng" >= ('-180'::integer)::double precision) AND ("lng" <= (180)::double precision)))
);


ALTER TABLE "public"."check_ins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "email" "text",
    "invited_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "max_uses" smallint DEFAULT 10 NOT NULL,
    "uses" smallint DEFAULT 0 NOT NULL,
    "status" "public"."invite_status" DEFAULT 'active'::"public"."invite_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_invites_expiry_max_7_days" CHECK (("expires_at" <= ("created_at" + '7 days'::interval))),
    CONSTRAINT "group_invites_max_uses_range" CHECK ((("max_uses" >= 1) AND ("max_uses" <= 10))),
    CONSTRAINT "group_invites_token_hash_format" CHECK (("token_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "group_invites_uses_range" CHECK ((("uses" >= 0) AND ("uses" <= "max_uses")))
);


ALTER TABLE "public"."group_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."group_role" DEFAULT 'member'::"public"."group_role" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "locale" "text" DEFAULT 'it'::"text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "home_airport_iata" character(3),
    "pace" "public"."trip_pace",
    "party" "public"."travel_party",
    "onboarding_completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "leaderboard_opt_out" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."group_member_profiles" WITH ("security_barrier"='true') AS
 SELECT "gm"."group_id",
    "gm"."user_id",
    "gm"."role",
    "gm"."joined_at",
    "p"."display_name",
    "p"."avatar_url"
   FROM ("public"."group_members" "gm"
     JOIN "public"."profiles" "p" ON (("p"."id" = "gm"."user_id")))
  WHERE "public"."is_group_member"("gm"."group_id");


ALTER VIEW "public"."group_member_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "itinerary_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "groups_name_length" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 80)))
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."image_authorizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "authority" "text" NOT NULL,
    "reference" "text" NOT NULL,
    "issued_on" "date" NOT NULL,
    "valid_until" "date" NOT NULL,
    "scope" "text" NOT NULL,
    "document_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "image_authorizations_authority_length" CHECK ((("char_length"("btrim"("authority")) >= 1) AND ("char_length"("btrim"("authority")) <= 200))),
    CONSTRAINT "image_authorizations_dates" CHECK (("valid_until" >= "issued_on")),
    CONSTRAINT "image_authorizations_document_url_https" CHECK (("document_url" ~ '^https://'::"text")),
    CONSTRAINT "image_authorizations_reference_length" CHECK ((("char_length"("btrim"("reference")) >= 1) AND ("char_length"("btrim"("reference")) <= 200)))
);


ALTER TABLE "public"."image_authorizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interests" (
    "key" "text" NOT NULL,
    "label_it" "text" NOT NULL,
    "label_en" "text" NOT NULL,
    "sort" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."interests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_votes" (
    "itinerary_item_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "value" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "item_votes_value_valid" CHECK (("value" = ANY (ARRAY['-1'::integer, 1])))
);


ALTER TABLE "public"."item_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."itineraries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "group_id" "uuid",
    "title" "text" NOT NULL,
    "slug" "text",
    "is_template" boolean DEFAULT false NOT NULL,
    "template_id" "uuid",
    "start_date" "date",
    "days" smallint NOT NULL,
    "status" "public"."itinerary_status" DEFAULT 'draft'::"public"."itinerary_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "day_titles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "travelers" smallint,
    "cover_media_id" "uuid",
    CONSTRAINT "itineraries_day_titles_within_days" CHECK (("cardinality"("day_titles") <= "days")),
    CONSTRAINT "itineraries_days_range" CHECK ((("days" >= 1) AND ("days" <= 60))),
    CONSTRAINT "itineraries_template_iff_editorial" CHECK ((("owner_id" IS NULL) = "is_template")),
    CONSTRAINT "itineraries_title_length" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 200))),
    CONSTRAINT "itineraries_travelers_range" CHECK ((("travelers" >= 1) AND ("travelers" <= 30)))
);


ALTER TABLE "public"."itineraries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."itinerary_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "itinerary_id" "uuid" NOT NULL,
    "day_index" smallint NOT NULL,
    "position" smallint NOT NULL,
    "activity_id" "uuid",
    "place_id" "uuid",
    "custom_title" "text",
    "start_time" time without time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "itinerary_items_day_index_non_negative" CHECK (("day_index" >= 0)),
    CONSTRAINT "itinerary_items_has_subject" CHECK ((("activity_id" IS NOT NULL) OR ("place_id" IS NOT NULL) OR ("custom_title" IS NOT NULL))),
    CONSTRAINT "itinerary_items_position_non_negative" CHECK (("position" >= 0))
);


ALTER TABLE "public"."itinerary_items" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."item_vote_balances" WITH ("security_invoker"='true') AS
 SELECT "v"."itinerary_item_id",
    ("sum"("v"."value"))::integer AS "balance",
    ("count"(*) FILTER (WHERE ("v"."value" = 1)))::integer AS "up_votes",
    ("count"(*) FILTER (WHERE ("v"."value" = '-1'::integer)))::integer AS "down_votes"
   FROM ((("public"."item_votes" "v"
     JOIN "public"."itinerary_items" "ii" ON (("ii"."id" = "v"."itinerary_item_id")))
     JOIN "public"."itineraries" "i" ON (("i"."id" = "ii"."itinerary_id")))
     JOIN "public"."group_members" "gm" ON ((("gm"."group_id" = "i"."group_id") AND ("gm"."user_id" = "v"."user_id"))))
  GROUP BY "v"."itinerary_item_id";


ALTER VIEW "public"."item_vote_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."itinerary_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "itinerary_id" "uuid" NOT NULL,
    "kind" "public"."booking_kind" NOT NULL,
    "activity_id" "uuid",
    "partner" "public"."partner",
    "status" "public"."booking_status" DEFAULT 'to_book'::"public"."booking_status" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "itinerary_bookings_activity_iff_kind" CHECK ((("kind" = 'activity'::"public"."booking_kind") = ("activity_id" IS NOT NULL)))
);


ALTER TABLE "public"."itinerary_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."points_ledger" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "delta" integer NOT NULL,
    "reason" "public"."point_reason" NOT NULL,
    "ref_type" "text" NOT NULL,
    "ref_id" "uuid" NOT NULL,
    "season" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "points_ledger_delta_non_zero" CHECK (("delta" <> 0)),
    CONSTRAINT "points_ledger_season_format" CHECK (("season" ~ '^[0-9]{4}-(estate|inverno)$'::"text"))
);


ALTER TABLE "public"."points_ledger" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."leaderboard_season_totals" AS
 SELECT "season",
    "user_id",
    ("sum"("delta"))::integer AS "total_points"
   FROM "public"."points_ledger"
  WHERE ("reason" <> ALL (ARRAY['redeem'::"public"."point_reason", 'redeem_refund'::"public"."point_reason"]))
  GROUP BY "season", "user_id"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."leaderboard_season_totals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."local_tip_authors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "public"."local_tip_author_kind" NOT NULL,
    "display_name" "text" NOT NULL,
    "bio" "text",
    "photo_url" "text",
    "profile_id" "uuid",
    "consent_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "local_tip_authors_person_consent" CHECK ((("kind" <> 'person'::"public"."local_tip_author_kind") OR ("consent_at" IS NOT NULL))),
    CONSTRAINT "local_tip_authors_photo_https" CHECK (("photo_url" ~ '^https://'::"text"))
);


ALTER TABLE "public"."local_tip_authors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."local_tips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "activity_id" "uuid",
    "place_id" "uuid",
    "body" "text" NOT NULL,
    "author_relation" "text",
    "verified_at" "date" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "local_tips_body_length" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 280))),
    CONSTRAINT "local_tips_target" CHECK ((("activity_id" IS NOT NULL) OR ("place_id" IS NOT NULL)))
);


ALTER TABLE "public"."local_tips" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."local_tips_due_for_review" WITH ("security_invoker"='true') AS
 SELECT "id",
    "author_id",
    "activity_id",
    "place_id",
    "body",
    "verified_at",
    (("verified_at" + '1 year'::interval))::"date" AS "expires_on"
   FROM "public"."local_tips" "t"
  WHERE ("is_active" AND (("verified_at" + '1 year'::interval) <= (CURRENT_DATE + '30 days'::interval)));


ALTER VIEW "public"."local_tips_due_for_review" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "storage_path" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "focal_x" double precision DEFAULT 0.5 NOT NULL,
    "focal_y" double precision DEFAULT 0.5 NOT NULL,
    "alt_it" "text",
    "alt_en" "text",
    "kind" "public"."media_kind" NOT NULL,
    "source_type" "public"."media_source_type" NOT NULL,
    "author" "text",
    "author_url" "text",
    "license" "text",
    "license_url" "text",
    "source_url" "text",
    "source_link" "text" GENERATED ALWAYS AS (
CASE
    WHEN ("source_url" ~ '^https://commons\.wikimedia\.org/'::"text") THEN "source_url"
    ELSE NULL::"text"
END) STORED,
    "accessed_at" "date",
    "modified" boolean DEFAULT false NOT NULL,
    "credit_text" "text" GENERATED ALWAYS AS (
CASE
    WHEN ("kind" = 'illustration'::"public"."media_kind") THEN 'Illustrazione di Isula'::"text"
    ELSE ((('Foto: '::"text" || COALESCE(NULLIF("btrim"("author"), ''::"text"), '?'::"text")) || COALESCE((', '::"text" || NULLIF("btrim"("license"), ''::"text")), ''::"text")) ||
    CASE
        WHEN "modified" THEN ' (modificata)'::"text"
        ELSE ''::"text"
    END)
END) STORED,
    "heritage_asset" boolean DEFAULT false NOT NULL,
    "authorization_id" "uuid",
    "blur_data_url" "text",
    "variants_version" integer DEFAULT 0 NOT NULL,
    "original_filename" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "media_author_url_http" CHECK (("author_url" ~ '^https?://'::"text")),
    CONSTRAINT "media_authorization_only_heritage" CHECK ((("authorization_id" IS NULL) OR "heritage_asset")),
    CONSTRAINT "media_dimensions_positive" CHECK ((("width" > 0) AND ("height" > 0))),
    CONSTRAINT "media_focal_range" CHECK (((("focal_x" >= (0)::double precision) AND ("focal_x" <= (1)::double precision)) AND (("focal_y" >= (0)::double precision) AND ("focal_y" <= (1)::double precision)))),
    CONSTRAINT "media_kind_matches_source" CHECK ((("kind" = 'illustration'::"public"."media_kind") = ("source_type" = 'illustration'::"public"."media_source_type"))),
    CONSTRAINT "media_license_url_http" CHECK (("license_url" ~ '^https?://'::"text")),
    CONSTRAINT "media_source_url_https" CHECK (("source_url" ~ '^https://'::"text")),
    CONSTRAINT "media_storage_path_format" CHECK (("storage_path" ~ '^[0-9a-f-]{36}/(master\.(jpg|png|webp)|illustration\.svg)$'::"text")),
    CONSTRAINT "media_variants_version_non_negative" CHECK (("variants_version" >= 0))
);


ALTER TABLE "public"."media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "producer_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "unit_price_cents" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_items_quantity_positive" CHECK (("quantity" > 0)),
    CONSTRAINT "order_items_unit_price_non_negative" CHECK (("unit_price_cents" >= 0))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_shipments" (
    "order_id" "uuid" NOT NULL,
    "producer_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "carrier" "text",
    "tracking_number" "text",
    "shipped_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_shipments_token_hash_format" CHECK (("token_hash" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "public"."order_shipments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "status" "public"."order_status" DEFAULT 'pending'::"public"."order_status" NOT NULL,
    "subtotal_cents" integer NOT NULL,
    "discount_cents" integer DEFAULT 0 NOT NULL,
    "shipping_cents" integer DEFAULT 0 NOT NULL,
    "total_cents" integer NOT NULL,
    "points_redeemed" integer DEFAULT 0 NOT NULL,
    "stripe_session_id" "text" NOT NULL,
    "shipping_address" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "orders_amounts_non_negative" CHECK ((("subtotal_cents" >= 0) AND ("discount_cents" >= 0) AND ("shipping_cents" >= 0) AND ("points_redeemed" >= 0))),
    CONSTRAINT "orders_discount_max_15_percent" CHECK ((("discount_cents" * 100) <= ("subtotal_cents" * 15))),
    CONSTRAINT "orders_total_consistent" CHECK (("total_cents" = (("subtotal_cents" - "discount_cents") + "shipping_cents")))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "province" character(2) NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "description" "text",
    "cover_image" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "area_id" "uuid",
    "cover_media_id" "uuid",
    "is_featured" boolean DEFAULT false NOT NULL,
    "featured_order" smallint,
    "is_home_hero" boolean DEFAULT false NOT NULL,
    "tagline_it" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "needs_review" boolean DEFAULT false NOT NULL,
    CONSTRAINT "places_lat_range" CHECK ((("lat" >= ('-90'::integer)::double precision) AND ("lat" <= (90)::double precision))),
    CONSTRAINT "places_lng_range" CHECK ((("lng" >= ('-180'::integer)::double precision) AND ("lng" <= (180)::double precision))),
    CONSTRAINT "places_tagline_it_length" CHECK (("char_length"("tagline_it") <= 90))
);


ALTER TABLE "public"."places" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."points_ledger_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."points_ledger_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."points_ledger_id_seq" OWNED BY "public"."points_ledger"."id";



CREATE TABLE IF NOT EXISTS "public"."preference_weights" (
    "user_id" "uuid" NOT NULL,
    "interest_key" "text" NOT NULL,
    "explicit" smallint DEFAULT 0 NOT NULL,
    "implicit" real DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "preference_weights_explicit_range" CHECK ((("explicit" >= 0) AND ("explicit" <= 5))),
    CONSTRAINT "preference_weights_implicit_range" CHECK ((("implicit" >= ('-2'::integer)::double precision) AND ("implicit" <= (2)::double precision)))
);


ALTER TABLE "public"."preference_weights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."producers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "vat_number" "text",
    "address" "text",
    "lead_time_days" smallint DEFAULT 3 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "producers_lead_time_positive" CHECK (("lead_time_days" > 0))
);


ALTER TABLE "public"."producers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "producer_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "price_cents" integer NOT NULL,
    "weight_g" integer NOT NULL,
    "images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_box" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "stripe_price_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "products_price_non_negative" CHECK (("price_cents" >= 0)),
    CONSTRAINT "products_weight_positive" CHECK (("weight_g" > 0))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_local_tips" WITH ("security_barrier"='true') AS
 SELECT "t"."id",
    "t"."activity_id",
    "t"."place_id",
    "t"."body",
    "t"."author_relation",
    "t"."verified_at",
    "a"."kind" AS "author_kind",
    "a"."display_name" AS "author_name",
    "a"."photo_url" AS "author_photo_url"
   FROM (("public"."local_tips" "t"
     JOIN "public"."local_tip_authors" "a" ON ((("a"."id" = "t"."author_id") AND "a"."is_active")))
     LEFT JOIN "public"."activities" "act" ON (("act"."id" = "t"."activity_id")))
  WHERE ("t"."is_active" AND ("t"."verified_at" > (CURRENT_DATE - '1 year'::interval)) AND (("t"."activity_id" IS NULL) OR "act"."is_active"));


ALTER VIEW "public"."public_local_tips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "rating" smallint NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_body_length" CHECK (("char_length"("body") <= 4000)),
    CONSTRAINT "reviews_rating_range" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_reviews" WITH ("security_barrier"='true') AS
 SELECT "r"."id",
    "r"."activity_id",
    "r"."rating",
    "r"."body",
    "r"."created_at",
    "p"."display_name",
    "p"."avatar_url"
   FROM (("public"."reviews" "r"
     JOIN "public"."activities" "a" ON ((("a"."id" = "r"."activity_id") AND "a"."is_active")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "r"."user_id")));


ALTER VIEW "public"."public_reviews" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."seasonal_leaderboard" WITH ("security_barrier"='true') AS
 SELECT "t"."season",
    ("rank"() OVER (PARTITION BY "t"."season" ORDER BY "t"."total_points" DESC))::integer AS "rank",
    "p"."display_name",
    "p"."avatar_url",
    "t"."total_points",
    ("t"."user_id" = "auth"."uid"()) AS "is_me"
   FROM ("public"."leaderboard_season_totals" "t"
     JOIN "public"."profiles" "p" ON (("p"."id" = "t"."user_id")))
  WHERE ((NOT "p"."leaderboard_opt_out") AND ("t"."total_points" > 0));


ALTER VIEW "public"."seasonal_leaderboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_badges" (
    "user_id" "uuid" NOT NULL,
    "badge_key" "text" NOT NULL,
    "awarded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_constraints" (
    "user_id" "uuid" NOT NULL,
    "budget_per_day_eur" integer,
    "reduced_mobility" boolean DEFAULT false NOT NULL,
    "diet" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "max_daily_travel_min" integer,
    "heat_tolerance" smallint,
    "crowd_tolerance" smallint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trip_days" smallint,
    "trip_months" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    "car_access" "public"."car_access",
    "arrival_airport" "text",
    "sensitive_consent_at" timestamp with time zone,
    CONSTRAINT "user_constraints_arrival_airport_valid" CHECK (("arrival_airport" = ANY (ARRAY['CTA'::"text", 'PMO'::"text", 'TPS'::"text", 'CIY'::"text"]))),
    CONSTRAINT "user_constraints_budget_non_negative" CHECK (("budget_per_day_eur" >= 0)),
    CONSTRAINT "user_constraints_crowd_range" CHECK ((("crowd_tolerance" >= 0) AND ("crowd_tolerance" <= 5))),
    CONSTRAINT "user_constraints_diet_valid" CHECK (("diet" <@ '{vegetarian,vegan,gluten_free,lactose_free}'::"text"[])),
    CONSTRAINT "user_constraints_heat_range" CHECK ((("heat_tolerance" >= 0) AND ("heat_tolerance" <= 5))),
    CONSTRAINT "user_constraints_sensitive_consent" CHECK (((("reduced_mobility" = false) AND ("diet" = '{}'::"text"[])) OR ("sensitive_consent_at" IS NOT NULL))),
    CONSTRAINT "user_constraints_travel_positive" CHECK (("max_daily_travel_min" > 0)),
    CONSTRAINT "user_constraints_trip_days_range" CHECK ((("trip_days" >= 1) AND ("trip_days" <= 14))),
    CONSTRAINT "user_constraints_trip_months_valid" CHECK (("trip_months" <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[]))
);


ALTER TABLE "public"."user_constraints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_events" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "public"."event_type" NOT NULL,
    "activity_id" "uuid",
    "itinerary_id" "uuid",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_events_id_seq" OWNED BY "public"."user_events"."id";



CREATE TABLE IF NOT EXISTS "public"."user_taste" (
    "user_id" "uuid" NOT NULL,
    "embedding" "extensions"."vector"(1024),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_taste" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admin_audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."points_ledger" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."points_ledger_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."activity_interests"
    ADD CONSTRAINT "activity_interests_activity_id_interest_key_pk" PRIMARY KEY ("activity_id", "interest_key");



ALTER TABLE ONLY "public"."activity_offers"
    ADD CONSTRAINT "activity_offers_partner_product_unique" UNIQUE ("partner", "partner_product_id");



ALTER TABLE ONLY "public"."activity_offers"
    ADD CONSTRAINT "activity_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_sources"
    ADD CONSTRAINT "activity_sources_pkey" PRIMARY KEY ("activity_id");



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_clicks"
    ADD CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_clicks"
    ADD CONSTRAINT "affiliate_clicks_subid_unique" UNIQUE ("subid");



ALTER TABLE ONLY "public"."affiliate_conversions"
    ADD CONSTRAINT "affiliate_conversions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_user_place_day_unique" UNIQUE ("user_id", "place_id", "local_date");



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_token_hash_unique" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY ("group_id", "user_id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."image_authorizations"
    ADD CONSTRAINT "image_authorizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interests"
    ADD CONSTRAINT "interests_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."item_votes"
    ADD CONSTRAINT "item_votes_itinerary_item_id_user_id_pk" PRIMARY KEY ("itinerary_item_id", "user_id");



ALTER TABLE ONLY "public"."itineraries"
    ADD CONSTRAINT "itineraries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."itineraries"
    ADD CONSTRAINT "itineraries_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."itinerary_bookings"
    ADD CONSTRAINT "itinerary_bookings_item_unique" UNIQUE NULLS NOT DISTINCT ("itinerary_id", "kind", "activity_id");



ALTER TABLE ONLY "public"."itinerary_bookings"
    ADD CONSTRAINT "itinerary_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."local_tip_authors"
    ADD CONSTRAINT "local_tip_authors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."local_tips"
    ADD CONSTRAINT "local_tips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_storage_path_unique" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_shipments"
    ADD CONSTRAINT "order_shipments_order_id_producer_id_pk" PRIMARY KEY ("order_id", "producer_id");



ALTER TABLE ONLY "public"."order_shipments"
    ADD CONSTRAINT "order_shipments_token_hash_unique" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_stripe_session_id_unique" UNIQUE ("stripe_session_id");



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."points_ledger"
    ADD CONSTRAINT "points_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."points_ledger"
    ADD CONSTRAINT "points_ledger_user_reason_ref_unique" UNIQUE ("user_id", "reason", "ref_id");



ALTER TABLE ONLY "public"."preference_weights"
    ADD CONSTRAINT "preference_weights_user_id_interest_key_pk" PRIMARY KEY ("user_id", "interest_key");



ALTER TABLE ONLY "public"."producers"
    ADD CONSTRAINT "producers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_activity_unique" UNIQUE ("user_id", "activity_id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_user_id_badge_key_pk" PRIMARY KEY ("user_id", "badge_key");



ALTER TABLE ONLY "public"."user_constraints"
    ADD CONSTRAINT "user_constraints_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_taste"
    ADD CONSTRAINT "user_taste_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "activities_cover_media_id_idx" ON "public"."activities" USING "btree" ("cover_media_id");



CREATE INDEX "activities_embedding_idx" ON "public"."activities" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



CREATE INDEX "activities_needs_review_idx" ON "public"."activities" USING "btree" ("needs_review") WHERE "needs_review";



CREATE INDEX "activities_place_id_idx" ON "public"."activities" USING "btree" ("place_id");



CREATE INDEX "activity_interests_interest_key_idx" ON "public"."activity_interests" USING "btree" ("interest_key");



CREATE INDEX "activity_offers_activity_id_idx" ON "public"."activity_offers" USING "btree" ("activity_id");



CREATE INDEX "admin_audit_log_created_at_idx" ON "public"."admin_audit_log" USING "btree" ("created_at");



CREATE INDEX "admin_audit_log_entity_idx" ON "public"."admin_audit_log" USING "btree" ("entity", "entity_id");



CREATE INDEX "affiliate_clicks_created_at_idx" ON "public"."affiliate_clicks" USING "btree" ("created_at");



CREATE INDEX "affiliate_conversions_subid_idx" ON "public"."affiliate_conversions" USING "btree" ("subid");



CREATE INDEX "chat_messages_session_created_idx" ON "public"."chat_messages" USING "btree" ("session_id", "created_at");



CREATE INDEX "chat_sessions_user_id_idx" ON "public"."chat_sessions" USING "btree" ("user_id");



CREATE INDEX "check_ins_user_date_idx" ON "public"."check_ins" USING "btree" ("user_id", "local_date");



CREATE INDEX "group_invites_group_id_idx" ON "public"."group_invites" USING "btree" ("group_id");



CREATE INDEX "group_members_user_id_idx" ON "public"."group_members" USING "btree" ("user_id");



CREATE INDEX "groups_owner_id_idx" ON "public"."groups" USING "btree" ("owner_id");



CREATE INDEX "item_votes_user_id_idx" ON "public"."item_votes" USING "btree" ("user_id");



CREATE INDEX "itineraries_cover_media_id_idx" ON "public"."itineraries" USING "btree" ("cover_media_id");



CREATE INDEX "itineraries_group_id_idx" ON "public"."itineraries" USING "btree" ("group_id");



CREATE INDEX "itineraries_owner_id_idx" ON "public"."itineraries" USING "btree" ("owner_id");



CREATE INDEX "itinerary_items_itinerary_day_position_idx" ON "public"."itinerary_items" USING "btree" ("itinerary_id", "day_index", "position");



CREATE UNIQUE INDEX "leaderboard_season_totals_season_user_idx" ON "public"."leaderboard_season_totals" USING "btree" ("season", "user_id");



CREATE INDEX "local_tips_activity_id_idx" ON "public"."local_tips" USING "btree" ("activity_id");



CREATE INDEX "local_tips_place_id_idx" ON "public"."local_tips" USING "btree" ("place_id");



CREATE INDEX "local_tips_verified_at_idx" ON "public"."local_tips" USING "btree" ("verified_at");



CREATE INDEX "media_authorization_id_idx" ON "public"."media" USING "btree" ("authorization_id");



CREATE INDEX "order_items_order_id_idx" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "orders_status_idx" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "orders_user_id_idx" ON "public"."orders" USING "btree" ("user_id");



CREATE INDEX "places_area_id_idx" ON "public"."places" USING "btree" ("area_id");



CREATE INDEX "places_cover_media_id_idx" ON "public"."places" USING "btree" ("cover_media_id");



CREATE UNIQUE INDEX "places_single_home_hero" ON "public"."places" USING "btree" ("is_home_hero") WHERE "is_home_hero";



CREATE INDEX "points_ledger_season_user_idx" ON "public"."points_ledger" USING "btree" ("season", "user_id");



CREATE INDEX "products_producer_id_idx" ON "public"."products" USING "btree" ("producer_id");



CREATE INDEX "reviews_activity_id_idx" ON "public"."reviews" USING "btree" ("activity_id");



CREATE INDEX "user_events_unprocessed_idx" ON "public"."user_events" USING "btree" ("user_id") WHERE ("processed_at" IS NULL);



CREATE INDEX "user_taste_embedding_idx" ON "public"."user_taste" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



CREATE CONSTRAINT TRIGGER "activities_require_tags" AFTER INSERT OR UPDATE OF "is_active" ON "public"."activities" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ("new"."is_active") EXECUTE FUNCTION "public"."check_activity_has_tags"();



CREATE CONSTRAINT TRIGGER "activity_interests_keep_active_tagged" AFTER DELETE OR UPDATE OF "activity_id" ON "public"."activity_interests" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."check_activity_has_tags"();



CREATE CONSTRAINT TRIGGER "activity_place_inactive" AFTER INSERT OR UPDATE OF "is_active", "place_id" ON "public"."activities" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ("new"."is_active") EXECUTE FUNCTION "public"."check_activity_place_active"();



CREATE OR REPLACE TRIGGER "admin_audit_log_immutable" BEFORE DELETE OR UPDATE ON "public"."admin_audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."admin_audit_log_immutable"();



CREATE OR REPLACE TRIGGER "admin_audit_log_no_truncate" BEFORE TRUNCATE ON "public"."admin_audit_log" FOR EACH STATEMENT EXECUTE FUNCTION "public"."prevent_mutation"();



CREATE OR REPLACE TRIGGER "groups_add_owner_member" AFTER INSERT ON "public"."groups" FOR EACH ROW EXECUTE FUNCTION "public"."groups_add_owner_member"();



CREATE OR REPLACE TRIGGER "itinerary_bookings_stamp" BEFORE INSERT OR UPDATE ON "public"."itinerary_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."itinerary_bookings_stamp"();



CREATE OR REPLACE TRIGGER "local_tip_authors_person_relation" BEFORE UPDATE OF "kind" ON "public"."local_tip_authors" FOR EACH ROW EXECUTE FUNCTION "public"."local_tip_authors_person_relation"();



CREATE OR REPLACE TRIGGER "local_tips_person_relation" BEFORE INSERT OR UPDATE ON "public"."local_tips" FOR EACH ROW EXECUTE FUNCTION "public"."local_tips_person_relation"();



CREATE OR REPLACE TRIGGER "media_touch_updated_at" BEFORE UPDATE ON "public"."media" FOR EACH ROW EXECUTE FUNCTION "public"."media_touch_updated_at"();



CREATE CONSTRAINT TRIGGER "place_has_active_activities" AFTER UPDATE OF "is_active" ON "public"."places" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ((NOT "new"."is_active")) EXECUTE FUNCTION "public"."check_place_has_active_activities"();



CREATE OR REPLACE TRIGGER "points_ledger_immutable" BEFORE DELETE OR UPDATE ON "public"."points_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_mutation"();



CREATE OR REPLACE TRIGGER "points_ledger_no_truncate" BEFORE TRUNCATE ON "public"."points_ledger" FOR EACH STATEMENT EXECUTE FUNCTION "public"."prevent_mutation"();



CREATE OR REPLACE TRIGGER "user_badges_immutable" BEFORE DELETE OR UPDATE ON "public"."user_badges" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_mutation"();



CREATE OR REPLACE TRIGGER "user_badges_no_truncate" BEFORE TRUNCATE ON "public"."user_badges" FOR EACH STATEMENT EXECUTE FUNCTION "public"."prevent_mutation"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."activity_interests"
    ADD CONSTRAINT "activity_interests_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_interests"
    ADD CONSTRAINT "activity_interests_interest_key_interests_key_fk" FOREIGN KEY ("interest_key") REFERENCES "public"."interests"("key") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_offers"
    ADD CONSTRAINT "activity_offers_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_sources"
    ADD CONSTRAINT "activity_sources_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."affiliate_clicks"
    ADD CONSTRAINT "affiliate_clicks_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."affiliate_clicks"
    ADD CONSTRAINT "affiliate_clicks_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."affiliate_clicks"
    ADD CONSTRAINT "affiliate_clicks_offer_id_activity_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."activity_offers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."affiliate_clicks"
    ADD CONSTRAINT "affiliate_clicks_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."check_ins"
    ADD CONSTRAINT "check_ins_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_votes"
    ADD CONSTRAINT "item_votes_itinerary_item_id_itinerary_items_id_fk" FOREIGN KEY ("itinerary_item_id") REFERENCES "public"."itinerary_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_votes"
    ADD CONSTRAINT "item_votes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itineraries"
    ADD CONSTRAINT "itineraries_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."itineraries"
    ADD CONSTRAINT "itineraries_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."itineraries"
    ADD CONSTRAINT "itineraries_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itineraries"
    ADD CONSTRAINT "itineraries_template_id_itineraries_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."itineraries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."itinerary_bookings"
    ADD CONSTRAINT "itinerary_bookings_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itinerary_bookings"
    ADD CONSTRAINT "itinerary_bookings_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itinerary_bookings"
    ADD CONSTRAINT "itinerary_bookings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itinerary_items"
    ADD CONSTRAINT "itinerary_items_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."local_tip_authors"
    ADD CONSTRAINT "local_tip_authors_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."local_tips"
    ADD CONSTRAINT "local_tips_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."local_tips"
    ADD CONSTRAINT "local_tips_author_id_local_tip_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."local_tip_authors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."local_tips"
    ADD CONSTRAINT "local_tips_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_authorization_id_image_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."image_authorizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_producer_id_producers_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_shipments"
    ADD CONSTRAINT "order_shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_shipments"
    ADD CONSTRAINT "order_shipments_producer_id_producers_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."points_ledger"
    ADD CONSTRAINT "points_ledger_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."preference_weights"
    ADD CONSTRAINT "preference_weights_interest_key_interests_key_fk" FOREIGN KEY ("interest_key") REFERENCES "public"."interests"("key") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."preference_weights"
    ADD CONSTRAINT "preference_weights_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_producer_id_producers_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_badge_key_badges_key_fk" FOREIGN KEY ("badge_key") REFERENCES "public"."badges"("key") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_constraints"
    ADD CONSTRAINT "user_constraints_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_taste"
    ADD CONSTRAINT "user_taste_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activities_delete_admin" ON "public"."activities" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activities_insert_admin" ON "public"."activities" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activities_select_active_anon" ON "public"."activities" FOR SELECT TO "anon" USING ("is_active");



CREATE POLICY "activities_select_active_or_admin" ON "public"."activities" FOR SELECT TO "authenticated" USING (("is_active" OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "activities_update_admin" ON "public"."activities" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."activity_interests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_interests_delete_admin" ON "public"."activity_interests" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activity_interests_insert_admin" ON "public"."activity_interests" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activity_interests_select_anon" ON "public"."activity_interests" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."activities" "a"
  WHERE (("a"."id" = "activity_interests"."activity_id") AND "a"."is_active"))));



CREATE POLICY "activity_interests_select_authenticated" ON "public"."activity_interests" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."activities" "a"
  WHERE (("a"."id" = "activity_interests"."activity_id") AND "a"."is_active")))));



CREATE POLICY "activity_interests_update_admin" ON "public"."activity_interests" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."activity_offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_offers_delete_admin" ON "public"."activity_offers" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activity_offers_insert_admin" ON "public"."activity_offers" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activity_offers_select_anon" ON "public"."activity_offers" FOR SELECT TO "anon" USING (("is_active" AND (EXISTS ( SELECT 1
   FROM "public"."activities" "a"
  WHERE (("a"."id" = "activity_offers"."activity_id") AND "a"."is_active")))));



CREATE POLICY "activity_offers_select_authenticated" ON "public"."activity_offers" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("is_active" AND (EXISTS ( SELECT 1
   FROM "public"."activities" "a"
  WHERE (("a"."id" = "activity_offers"."activity_id") AND "a"."is_active"))))));



CREATE POLICY "activity_offers_update_admin" ON "public"."activity_offers" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."activity_sources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_sources_delete_admin" ON "public"."activity_sources" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activity_sources_insert_admin" ON "public"."activity_sources" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activity_sources_select_admin" ON "public"."activity_sources" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "activity_sources_update_admin" ON "public"."activity_sources" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_audit_log_select_admin" ON "public"."admin_audit_log" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."affiliate_clicks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "affiliate_clicks_select_admin" ON "public"."affiliate_clicks" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."affiliate_conversions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "affiliate_conversions_select_admin" ON "public"."affiliate_conversions" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "areas_delete_admin" ON "public"."areas" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "areas_insert_admin" ON "public"."areas" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "areas_select_all" ON "public"."areas" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "areas_update_admin" ON "public"."areas" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "badges_delete_admin" ON "public"."badges" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "badges_insert_admin" ON "public"."badges" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "badges_select_all" ON "public"."badges" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "badges_update_admin" ON "public"."badges" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_messages_select_own" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chat_sessions" "s"
  WHERE (("s"."id" = "chat_messages"."session_id") AND ("s"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."chat_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_sessions_delete_own" ON "public"."chat_sessions" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "chat_sessions_insert_own" ON "public"."chat_sessions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("itinerary_id" IS NULL) OR "public"."can_access_itinerary"("itinerary_id"))));



CREATE POLICY "chat_sessions_select_own" ON "public"."chat_sessions" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "chat_sessions_update_own" ON "public"."chat_sessions" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."check_ins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "check_ins_select_own" ON "public"."check_ins" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."group_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_invites_delete_owner" ON "public"."group_invites" FOR DELETE TO "authenticated" USING ("public"."is_group_owner"("group_id"));



CREATE POLICY "group_invites_insert_owner" ON "public"."group_invites" FOR INSERT TO "authenticated" WITH CHECK ((("invited_by" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_group_owner"("group_id") AND (NOT COALESCE(( SELECT (("auth"."jwt"() ->> 'is_anonymous'::"text"))::boolean AS "bool"), false))));



CREATE POLICY "group_invites_select_owner" ON "public"."group_invites" FOR SELECT TO "authenticated" USING ("public"."is_group_owner"("group_id"));



CREATE POLICY "group_invites_update_owner" ON "public"."group_invites" FOR UPDATE TO "authenticated" USING ("public"."is_group_owner"("group_id")) WITH CHECK (("public"."is_group_owner"("group_id") AND ("status" = 'revoked'::"public"."invite_status")));



ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_members_delete" ON "public"."group_members" FOR DELETE TO "authenticated" USING (((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (NOT "public"."is_group_owner"("group_id"))) OR ("public"."is_group_owner"("group_id") AND ("user_id" <> ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "group_members_select_members" ON "public"."group_members" FOR SELECT TO "authenticated" USING ("public"."is_group_member"("group_id"));



ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "groups_delete_sole_owner" ON "public"."groups" FOR DELETE TO "authenticated" USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) AND (NOT "public"."group_has_other_members"("id"))));



CREATE POLICY "groups_select_members" ON "public"."groups" FOR SELECT TO "authenticated" USING ("public"."is_group_member"("id"));



CREATE POLICY "groups_update_owner" ON "public"."groups" FOR UPDATE TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."image_authorizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "interests_delete_admin" ON "public"."interests" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "interests_insert_admin" ON "public"."interests" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "interests_select_all" ON "public"."interests" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "interests_update_admin" ON "public"."interests" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."item_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "item_votes_delete_own" ON "public"."item_votes" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."can_vote_item"("itinerary_item_id")));



CREATE POLICY "item_votes_insert_own" ON "public"."item_votes" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."can_vote_item"("itinerary_item_id") AND (NOT COALESCE(( SELECT (("auth"."jwt"() ->> 'is_anonymous'::"text"))::boolean AS "bool"), false))));



CREATE POLICY "item_votes_select_members" ON "public"."item_votes" FOR SELECT TO "authenticated" USING ("public"."can_vote_item"("itinerary_item_id"));



CREATE POLICY "item_votes_update_own" ON "public"."item_votes" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."can_vote_item"("itinerary_item_id"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."can_vote_item"("itinerary_item_id") AND (NOT COALESCE(( SELECT (("auth"."jwt"() ->> 'is_anonymous'::"text"))::boolean AS "bool"), false))));



ALTER TABLE "public"."itineraries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "itineraries_delete" ON "public"."itineraries" FOR DELETE TO "authenticated" USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("is_template" AND ( SELECT "public"."is_admin"() AS "is_admin"))));



CREATE POLICY "itineraries_insert" ON "public"."itineraries" FOR INSERT TO "authenticated" WITH CHECK ((((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) AND (NOT "is_template") AND ("slug" IS NULL)) OR (("owner_id" IS NULL) AND "is_template" AND ( SELECT "public"."is_admin"() AS "is_admin"))) AND (("template_id" IS NULL) OR "public"."can_access_itinerary"("template_id"))));



CREATE POLICY "itineraries_select_authenticated" ON "public"."itineraries" FOR SELECT TO "authenticated" USING (("is_template" OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("group_id" IS NOT NULL) AND "public"."is_group_member"("group_id"))));



CREATE POLICY "itineraries_select_template_anon" ON "public"."itineraries" FOR SELECT TO "anon" USING ("is_template");



CREATE POLICY "itineraries_update" ON "public"."itineraries" FOR UPDATE TO "authenticated" USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("group_id" IS NOT NULL) AND "public"."is_group_member"("group_id")) OR ("is_template" AND ( SELECT "public"."is_admin"() AS "is_admin")))) WITH CHECK ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("group_id" IS NOT NULL) AND "public"."is_group_member"("group_id")) OR ("is_template" AND ( SELECT "public"."is_admin"() AS "is_admin"))));



ALTER TABLE "public"."itinerary_bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "itinerary_bookings_delete" ON "public"."itinerary_bookings" FOR DELETE TO "authenticated" USING ("public"."can_edit_itinerary"("itinerary_id"));



CREATE POLICY "itinerary_bookings_insert" ON "public"."itinerary_bookings" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_edit_itinerary"("itinerary_id") AND (EXISTS ( SELECT 1
   FROM "public"."itineraries" "i"
  WHERE (("i"."id" = "itinerary_bookings"."itinerary_id") AND (NOT "i"."is_template"))))));



CREATE POLICY "itinerary_bookings_select" ON "public"."itinerary_bookings" FOR SELECT TO "authenticated" USING ("public"."can_access_itinerary"("itinerary_id"));



CREATE POLICY "itinerary_bookings_update" ON "public"."itinerary_bookings" FOR UPDATE TO "authenticated" USING ("public"."can_edit_itinerary"("itinerary_id")) WITH CHECK ("public"."can_edit_itinerary"("itinerary_id"));



ALTER TABLE "public"."itinerary_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "itinerary_items_delete" ON "public"."itinerary_items" FOR DELETE TO "authenticated" USING ("public"."can_edit_itinerary"("itinerary_id"));



CREATE POLICY "itinerary_items_insert" ON "public"."itinerary_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_edit_itinerary"("itinerary_id"));



CREATE POLICY "itinerary_items_select" ON "public"."itinerary_items" FOR SELECT TO "authenticated", "anon" USING ("public"."can_access_itinerary"("itinerary_id"));



CREATE POLICY "itinerary_items_update" ON "public"."itinerary_items" FOR UPDATE TO "authenticated" USING ("public"."can_edit_itinerary"("itinerary_id")) WITH CHECK ("public"."can_edit_itinerary"("itinerary_id"));



ALTER TABLE "public"."local_tip_authors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "local_tip_authors_delete_admin" ON "public"."local_tip_authors" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "local_tip_authors_insert_admin" ON "public"."local_tip_authors" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "local_tip_authors_select_admin" ON "public"."local_tip_authors" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "local_tip_authors_update_admin" ON "public"."local_tip_authors" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."local_tips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "local_tips_delete_admin" ON "public"."local_tips" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "local_tips_insert_admin" ON "public"."local_tips" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "local_tips_select_admin" ON "public"."local_tips" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "local_tips_update_admin" ON "public"."local_tips" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "media_select_admin" ON "public"."media" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "media_select_public" ON "public"."media" FOR SELECT TO "authenticated", "anon" USING ("public"."media_is_public"("id"));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_select_own" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."order_shipments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_shipments_select_own" ON "public"."order_shipments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_shipments"."order_id") AND ("o"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_select_own" ON "public"."orders" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."places" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "places_delete_admin" ON "public"."places" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "places_insert_admin" ON "public"."places" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "places_select_active_anon" ON "public"."places" FOR SELECT TO "anon" USING ("is_active");



CREATE POLICY "places_select_active_or_admin" ON "public"."places" FOR SELECT TO "authenticated" USING (("is_active" OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "places_update_admin" ON "public"."places" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."points_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "points_ledger_select_own" ON "public"."points_ledger" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."preference_weights" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "preference_weights_delete_own" ON "public"."preference_weights" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "preference_weights_insert_own" ON "public"."preference_weights" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "preference_weights_select_own" ON "public"."preference_weights" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "preference_weights_update_own" ON "public"."preference_weights" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."producers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "producers_delete_admin" ON "public"."producers" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "producers_insert_admin" ON "public"."producers" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "producers_select_admin" ON "public"."producers" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "producers_update_admin" ON "public"."producers" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_delete_admin" ON "public"."products" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "products_insert_admin" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "products_select_active_anon" ON "public"."products" FOR SELECT TO "anon" USING ("is_active");



CREATE POLICY "products_select_active_or_admin" ON "public"."products" FOR SELECT TO "authenticated" USING (("is_active" OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "products_update_admin" ON "public"."products" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_delete_own" ON "public"."reviews" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "reviews_insert_own" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (NOT COALESCE(( SELECT (("auth"."jwt"() ->> 'is_anonymous'::"text"))::boolean AS "bool"), false))));



CREATE POLICY "reviews_select_own" ON "public"."reviews" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "reviews_update_own" ON "public"."reviews" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (NOT COALESCE(( SELECT (("auth"."jwt"() ->> 'is_anonymous'::"text"))::boolean AS "bool"), false))));



ALTER TABLE "public"."user_badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_badges_select_own" ON "public"."user_badges" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_constraints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_constraints_delete_own" ON "public"."user_constraints" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_constraints_insert_own" ON "public"."user_constraints" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_constraints_select_own" ON "public"."user_constraints" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_constraints_update_own" ON "public"."user_constraints" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_events_insert_own" ON "public"."user_events" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_taste" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_taste_select_own" ON "public"."user_taste" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_invite"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_invite"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_invite"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invite"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_audit_log_immutable"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_audit_log_immutable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_audit_log_immutable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."affiliate_subid_param"("p_partner" "public"."partner") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."affiliate_subid_param"("p_partner" "public"."partner") TO "service_role";



REVOKE ALL ON FUNCTION "public"."award_points"("p_user_id" "uuid", "p_delta" integer, "p_reason" "public"."point_reason", "p_ref_type" "text", "p_ref_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_points"("p_user_id" "uuid", "p_delta" integer, "p_reason" "public"."point_reason", "p_ref_type" "text", "p_ref_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_itinerary"("iid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_itinerary"("iid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_itinerary"("iid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_itinerary"("iid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_edit_itinerary"("iid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_edit_itinerary"("iid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_itinerary"("iid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_itinerary"("iid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_vote_item"("item_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_vote_item"("item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_vote_item"("item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_vote_item"("item_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_activity_has_tags"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_activity_has_tags"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_activity_place_active"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_activity_place_active"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_place_has_active_activities"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_place_has_active_activities"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_group"("p_name" "text", "p_itinerary_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_group"("p_name" "text", "p_itinerary_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_group"("p_name" "text", "p_itinerary_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_group"("p_name" "text", "p_itinerary_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_inactive_guests"("p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_inactive_guests"("p_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."group_has_other_members"("gid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."group_has_other_members"("gid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."group_has_other_members"("gid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."group_has_other_members"("gid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."group_leaderboard"("gid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."group_leaderboard"("gid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."group_leaderboard"("gid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."group_leaderboard"("gid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."groups_add_owner_member"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."groups_add_owner_member"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."invite_preview"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invite_preview"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_preview"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_preview"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_group_member"("gid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_group_member"("gid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_member"("gid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_member"("gid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_group_owner"("gid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_group_owner"("gid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_owner"("gid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_owner"("gid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."itinerary_bookings_stamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."itinerary_bookings_stamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."itinerary_bookings_stamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."local_tip_authors_person_relation"() TO "anon";
GRANT ALL ON FUNCTION "public"."local_tip_authors_person_relation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."local_tip_authors_person_relation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."local_tips_person_relation"() TO "anon";
GRANT ALL ON FUNCTION "public"."local_tips_person_relation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."local_tips_person_relation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."media_is_public"("p_media_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."media_is_public"("p_media_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."media_is_public"("p_media_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."media_is_public"("p_media_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."media_is_usable"("p_media_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."media_is_usable"("p_media_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."media_is_usable"("p_media_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."media_is_usable"("p_media_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."media_object_is_public"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."media_object_is_public"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."media_object_is_public"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."media_object_is_public"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."media_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."media_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."media_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_affiliate_click"("p_offer_id" "uuid", "p_subid" "text", "p_context" "text", "p_anon_id" "text", "p_itinerary_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_affiliate_click"("p_offer_id" "uuid", "p_subid" "text", "p_context" "text", "p_anon_id" "text", "p_itinerary_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_affiliate_click"("p_offer_id" "uuid", "p_subid" "text", "p_context" "text", "p_anon_id" "text", "p_itinerary_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_affiliate_click"("p_offer_id" "uuid", "p_subid" "text", "p_context" "text", "p_anon_id" "text", "p_itinerary_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_leaderboard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_leaderboard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."season_for"("ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."season_for"("ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."season_for"("ts" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_group_ownership"("p_group_id" "uuid", "p_new_owner" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_group_ownership"("p_group_id" "uuid", "p_new_owner" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_group_ownership"("p_group_id" "uuid", "p_new_owner" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_group_ownership"("p_group_id" "uuid", "p_new_owner" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "service_role";
GRANT SELECT ON TABLE "public"."activities" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."activities" TO "authenticated";



GRANT ALL ON TABLE "public"."activity_interests" TO "service_role";
GRANT SELECT ON TABLE "public"."activity_interests" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."activity_interests" TO "authenticated";



GRANT ALL ON TABLE "public"."activity_offers" TO "service_role";
GRANT INSERT,DELETE,UPDATE ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("id") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("id") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("activity_id") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("activity_id") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("partner") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("partner") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("partner_product_id") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("partner_product_id") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("title") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("title") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("price_from_eur") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("price_from_eur") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("currency") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("currency") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("rating") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("rating") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("reviews_count") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("reviews_count") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("free_cancellation") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("free_cancellation") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("price_updated_at") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("price_updated_at") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("is_active") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("is_active") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."activity_offers" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."activity_offers" TO "authenticated";



GRANT ALL ON TABLE "public"."activity_sources" TO "service_role";
GRANT DELETE ON TABLE "public"."activity_sources" TO "authenticated";



GRANT SELECT("activity_id"),INSERT("activity_id") ON TABLE "public"."activity_sources" TO "authenticated";



GRANT SELECT("source_url"),INSERT("source_url"),UPDATE("source_url") ON TABLE "public"."activity_sources" TO "authenticated";



GRANT SELECT("notes"),INSERT("notes"),UPDATE("notes") ON TABLE "public"."activity_sources" TO "authenticated";



GRANT SELECT("updated_at"),UPDATE("updated_at") ON TABLE "public"."activity_sources" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."activity_sources" TO "authenticated";



GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";
GRANT SELECT ON TABLE "public"."admin_audit_log" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."admin_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admin_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admin_audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_clicks" TO "service_role";
GRANT SELECT ON TABLE "public"."affiliate_clicks" TO "authenticated";



GRANT ALL ON TABLE "public"."affiliate_conversions" TO "service_role";
GRANT SELECT ON TABLE "public"."affiliate_conversions" TO "authenticated";



GRANT ALL ON TABLE "public"."areas" TO "service_role";
GRANT SELECT ON TABLE "public"."areas" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."areas" TO "authenticated";



GRANT ALL ON TABLE "public"."badges" TO "service_role";
GRANT SELECT ON TABLE "public"."badges" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."badges" TO "authenticated";



GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";
GRANT SELECT ON TABLE "public"."chat_messages" TO "authenticated";



GRANT ALL ON TABLE "public"."chat_sessions" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."chat_sessions" TO "authenticated";



GRANT INSERT("id") ON TABLE "public"."chat_sessions" TO "authenticated";



GRANT INSERT("user_id") ON TABLE "public"."chat_sessions" TO "authenticated";



GRANT INSERT("itinerary_id") ON TABLE "public"."chat_sessions" TO "authenticated";



GRANT INSERT("title"),UPDATE("title") ON TABLE "public"."chat_sessions" TO "authenticated";



GRANT ALL ON TABLE "public"."check_ins" TO "service_role";
GRANT SELECT ON TABLE "public"."check_ins" TO "authenticated";



GRANT ALL ON TABLE "public"."group_invites" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."group_invites" TO "authenticated";



GRANT INSERT("group_id") ON TABLE "public"."group_invites" TO "authenticated";



GRANT INSERT("token_hash") ON TABLE "public"."group_invites" TO "authenticated";



GRANT INSERT("email") ON TABLE "public"."group_invites" TO "authenticated";



GRANT INSERT("invited_by") ON TABLE "public"."group_invites" TO "authenticated";



GRANT INSERT("expires_at") ON TABLE "public"."group_invites" TO "authenticated";



GRANT INSERT("max_uses") ON TABLE "public"."group_invites" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."group_invites" TO "authenticated";



GRANT ALL ON TABLE "public"."group_members" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."group_members" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("display_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("locale") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("home_airport_iata") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("pace") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("party") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("onboarding_completed_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("leaderboard_opt_out") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."group_member_profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."group_member_profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."groups" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."groups" TO "authenticated";



GRANT UPDATE("name") ON TABLE "public"."groups" TO "authenticated";



GRANT ALL ON TABLE "public"."image_authorizations" TO "service_role";



GRANT ALL ON TABLE "public"."interests" TO "service_role";
GRANT SELECT ON TABLE "public"."interests" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."interests" TO "authenticated";



GRANT ALL ON TABLE "public"."item_votes" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."item_votes" TO "authenticated";



GRANT INSERT("itinerary_item_id") ON TABLE "public"."item_votes" TO "authenticated";



GRANT INSERT("user_id") ON TABLE "public"."item_votes" TO "authenticated";



GRANT INSERT("value"),UPDATE("value") ON TABLE "public"."item_votes" TO "authenticated";



GRANT ALL ON TABLE "public"."itineraries" TO "service_role";
GRANT SELECT ON TABLE "public"."itineraries" TO "anon";
GRANT SELECT,DELETE ON TABLE "public"."itineraries" TO "authenticated";



GRANT INSERT("id") ON TABLE "public"."itineraries" TO "authenticated";



GRANT INSERT("owner_id") ON TABLE "public"."itineraries" TO "authenticated";



GRANT INSERT("title"),UPDATE("title") ON TABLE "public"."itineraries" TO "authenticated";



GRANT INSERT("slug") ON TABLE "public"."itineraries" TO "authenticated";



GRANT INSERT("is_template") ON TABLE "public"."itineraries" TO "authenticated";



GRANT INSERT("template_id") ON TABLE "public"."itineraries" TO "authenticated";



GRANT INSERT("start_date"),UPDATE("start_date") ON TABLE "public"."itineraries" TO "authenticated";



GRANT INSERT("days"),UPDATE("days") ON TABLE "public"."itineraries" TO "authenticated";



GRANT INSERT("status"),UPDATE("status") ON TABLE "public"."itineraries" TO "authenticated";



GRANT INSERT("day_titles"),UPDATE("day_titles") ON TABLE "public"."itineraries" TO "authenticated";



GRANT INSERT("travelers"),UPDATE("travelers") ON TABLE "public"."itineraries" TO "authenticated";



GRANT ALL ON TABLE "public"."itinerary_items" TO "service_role";
GRANT SELECT ON TABLE "public"."itinerary_items" TO "anon";
GRANT SELECT,DELETE ON TABLE "public"."itinerary_items" TO "authenticated";



GRANT INSERT("id") ON TABLE "public"."itinerary_items" TO "authenticated";



GRANT INSERT("itinerary_id") ON TABLE "public"."itinerary_items" TO "authenticated";



GRANT INSERT("day_index"),UPDATE("day_index") ON TABLE "public"."itinerary_items" TO "authenticated";



GRANT INSERT("position"),UPDATE("position") ON TABLE "public"."itinerary_items" TO "authenticated";



GRANT INSERT("activity_id"),UPDATE("activity_id") ON TABLE "public"."itinerary_items" TO "authenticated";



GRANT INSERT("place_id"),UPDATE("place_id") ON TABLE "public"."itinerary_items" TO "authenticated";



GRANT INSERT("custom_title"),UPDATE("custom_title") ON TABLE "public"."itinerary_items" TO "authenticated";



GRANT INSERT("start_time"),UPDATE("start_time") ON TABLE "public"."itinerary_items" TO "authenticated";



GRANT INSERT("notes"),UPDATE("notes") ON TABLE "public"."itinerary_items" TO "authenticated";



GRANT ALL ON TABLE "public"."item_vote_balances" TO "service_role";
GRANT SELECT ON TABLE "public"."item_vote_balances" TO "authenticated";



GRANT ALL ON TABLE "public"."itinerary_bookings" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."itinerary_bookings" TO "authenticated";



GRANT INSERT("itinerary_id") ON TABLE "public"."itinerary_bookings" TO "authenticated";



GRANT INSERT("kind") ON TABLE "public"."itinerary_bookings" TO "authenticated";



GRANT INSERT("activity_id") ON TABLE "public"."itinerary_bookings" TO "authenticated";



GRANT INSERT("status"),UPDATE("status") ON TABLE "public"."itinerary_bookings" TO "authenticated";



GRANT ALL ON TABLE "public"."points_ledger" TO "service_role";
GRANT SELECT ON TABLE "public"."points_ledger" TO "authenticated";



GRANT ALL ON TABLE "public"."leaderboard_season_totals" TO "service_role";



GRANT ALL ON TABLE "public"."local_tip_authors" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."local_tip_authors" TO "authenticated";



GRANT ALL ON TABLE "public"."local_tips" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."local_tips" TO "authenticated";



GRANT ALL ON TABLE "public"."local_tips_due_for_review" TO "service_role";
GRANT SELECT ON TABLE "public"."local_tips_due_for_review" TO "authenticated";



GRANT ALL ON TABLE "public"."media" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."media" TO "anon";
GRANT SELECT("id") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("storage_path") ON TABLE "public"."media" TO "anon";
GRANT SELECT("storage_path") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("width") ON TABLE "public"."media" TO "anon";
GRANT SELECT("width") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("height") ON TABLE "public"."media" TO "anon";
GRANT SELECT("height") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("focal_x") ON TABLE "public"."media" TO "anon";
GRANT SELECT("focal_x") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("focal_y") ON TABLE "public"."media" TO "anon";
GRANT SELECT("focal_y") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("alt_it") ON TABLE "public"."media" TO "anon";
GRANT SELECT("alt_it") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("alt_en") ON TABLE "public"."media" TO "anon";
GRANT SELECT("alt_en") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("kind") ON TABLE "public"."media" TO "anon";
GRANT SELECT("kind") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("source_type") ON TABLE "public"."media" TO "anon";
GRANT SELECT("source_type") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("author") ON TABLE "public"."media" TO "anon";
GRANT SELECT("author") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("author_url") ON TABLE "public"."media" TO "anon";
GRANT SELECT("author_url") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("license") ON TABLE "public"."media" TO "anon";
GRANT SELECT("license") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("license_url") ON TABLE "public"."media" TO "anon";
GRANT SELECT("license_url") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("source_link") ON TABLE "public"."media" TO "anon";
GRANT SELECT("source_link") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("modified") ON TABLE "public"."media" TO "anon";
GRANT SELECT("modified") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("credit_text") ON TABLE "public"."media" TO "anon";
GRANT SELECT("credit_text") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("blur_data_url") ON TABLE "public"."media" TO "anon";
GRANT SELECT("blur_data_url") ON TABLE "public"."media" TO "authenticated";



GRANT SELECT("variants_version") ON TABLE "public"."media" TO "anon";
GRANT SELECT("variants_version") ON TABLE "public"."media" TO "authenticated";



GRANT ALL ON TABLE "public"."order_items" TO "service_role";
GRANT SELECT ON TABLE "public"."order_items" TO "authenticated";



GRANT ALL ON TABLE "public"."order_shipments" TO "service_role";



GRANT SELECT("order_id") ON TABLE "public"."order_shipments" TO "authenticated";



GRANT SELECT("producer_id") ON TABLE "public"."order_shipments" TO "authenticated";



GRANT SELECT("carrier") ON TABLE "public"."order_shipments" TO "authenticated";



GRANT SELECT("tracking_number") ON TABLE "public"."order_shipments" TO "authenticated";



GRANT SELECT("shipped_at") ON TABLE "public"."order_shipments" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."order_shipments" TO "authenticated";



GRANT ALL ON TABLE "public"."orders" TO "service_role";
GRANT SELECT ON TABLE "public"."orders" TO "authenticated";



GRANT ALL ON TABLE "public"."places" TO "service_role";
GRANT SELECT ON TABLE "public"."places" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."places" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."points_ledger_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."points_ledger_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."points_ledger_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."preference_weights" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."preference_weights" TO "authenticated";



GRANT INSERT("user_id") ON TABLE "public"."preference_weights" TO "authenticated";



GRANT INSERT("interest_key") ON TABLE "public"."preference_weights" TO "authenticated";



GRANT INSERT("explicit"),UPDATE("explicit") ON TABLE "public"."preference_weights" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "public"."preference_weights" TO "authenticated";



GRANT ALL ON TABLE "public"."producers" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."producers" TO "authenticated";



GRANT ALL ON TABLE "public"."products" TO "service_role";
GRANT SELECT ON TABLE "public"."products" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."products" TO "authenticated";



GRANT ALL ON TABLE "public"."public_local_tips" TO "service_role";
GRANT SELECT ON TABLE "public"."public_local_tips" TO "anon";
GRANT SELECT ON TABLE "public"."public_local_tips" TO "authenticated";



GRANT ALL ON TABLE "public"."reviews" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."reviews" TO "authenticated";



GRANT INSERT("user_id") ON TABLE "public"."reviews" TO "authenticated";



GRANT INSERT("activity_id") ON TABLE "public"."reviews" TO "authenticated";



GRANT INSERT("rating"),UPDATE("rating") ON TABLE "public"."reviews" TO "authenticated";



GRANT INSERT("body"),UPDATE("body") ON TABLE "public"."reviews" TO "authenticated";



GRANT ALL ON TABLE "public"."public_reviews" TO "service_role";
GRANT SELECT ON TABLE "public"."public_reviews" TO "anon";
GRANT SELECT ON TABLE "public"."public_reviews" TO "authenticated";



GRANT ALL ON TABLE "public"."seasonal_leaderboard" TO "service_role";
GRANT SELECT ON TABLE "public"."seasonal_leaderboard" TO "authenticated";



GRANT ALL ON TABLE "public"."user_badges" TO "service_role";
GRANT SELECT ON TABLE "public"."user_badges" TO "authenticated";



GRANT ALL ON TABLE "public"."user_constraints" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("user_id") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("budget_per_day_eur"),UPDATE("budget_per_day_eur") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("reduced_mobility"),UPDATE("reduced_mobility") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("diet"),UPDATE("diet") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("max_daily_travel_min"),UPDATE("max_daily_travel_min") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("heat_tolerance"),UPDATE("heat_tolerance") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("crowd_tolerance"),UPDATE("crowd_tolerance") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("trip_days"),UPDATE("trip_days") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("trip_months"),UPDATE("trip_months") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("car_access"),UPDATE("car_access") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("arrival_airport"),UPDATE("arrival_airport") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT INSERT("sensitive_consent_at"),UPDATE("sensitive_consent_at") ON TABLE "public"."user_constraints" TO "authenticated";



GRANT ALL ON TABLE "public"."user_events" TO "service_role";



GRANT INSERT("user_id") ON TABLE "public"."user_events" TO "authenticated";



GRANT INSERT("type") ON TABLE "public"."user_events" TO "authenticated";



GRANT INSERT("activity_id") ON TABLE "public"."user_events" TO "authenticated";



GRANT INSERT("itinerary_id") ON TABLE "public"."user_events" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."user_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_taste" TO "service_role";
GRANT SELECT ON TABLE "public"."user_taste" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







