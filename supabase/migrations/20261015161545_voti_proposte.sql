CREATE TABLE "itinerary_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "itinerary_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"itinerary_id" uuid NOT NULL,
	"actor_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itinerary_changes_payload_small" CHECK (jsonb_typeof("itinerary_changes"."payload") = 'object' and pg_column_size("itinerary_changes"."payload") <= 1024),
	CONSTRAINT "itinerary_changes_kind_valid" CHECK ("itinerary_changes"."kind" in ('stop_added','stop_removed','stop_moved','stop_replaced','day_added','day_removed','proposal_accepted'))
);
--> statement-breakpoint
CREATE TABLE "itinerary_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itinerary_id" uuid NOT NULL,
	"proposed_by" uuid,
	"activity_id" uuid NOT NULL,
	"day_index" smallint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itinerary_proposals_day_index_non_negative" CHECK ("itinerary_proposals"."day_index" >= 0),
	CONSTRAINT "itinerary_proposals_status_valid" CHECK ("itinerary_proposals"."status" in ('pending','accepted','rejected'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_kind_valid" CHECK ("notifications"."kind" in ('proposal_accepted','proposal_rejected'))
);
--> statement-breakpoint
-- Colonna aggiunta nullable, riempita dalle tappe già votate, poi not null. Il vincolo di chiave
-- esterna e l'indice li genera drizzle nella parte generata (src/server/db/schema/trips.ts).
alter table public.item_votes add column "itinerary_id" uuid;--> statement-breakpoint
update public.item_votes v
set itinerary_id = ii.itinerary_id
from public.itinerary_items ii
where ii.id = v.itinerary_item_id;--> statement-breakpoint
alter table public.item_votes alter column "itinerary_id" set not null;--> statement-breakpoint
ALTER TABLE "itinerary_changes" ADD CONSTRAINT "itinerary_changes_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_changes" ADD CONSTRAINT "itinerary_changes_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_proposals" ADD CONSTRAINT "itinerary_proposals_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_proposals" ADD CONSTRAINT "itinerary_proposals_proposed_by_profiles_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_proposals" ADD CONSTRAINT "itinerary_proposals_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_proposals" ADD CONSTRAINT "itinerary_proposals_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "itinerary_changes_itinerary_id_idx" ON "itinerary_changes" USING btree ("itinerary_id","id");--> statement-breakpoint
CREATE INDEX "itinerary_proposals_itinerary_status_idx" ON "itinerary_proposals" USING btree ("itinerary_id","status");--> statement-breakpoint
CREATE INDEX "itinerary_proposals_proposed_by_idx" ON "itinerary_proposals" USING btree ("proposed_by");--> statement-breakpoint
CREATE INDEX "itinerary_proposals_activity_id_idx" ON "itinerary_proposals" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
ALTER TABLE "item_votes" ADD CONSTRAINT "item_votes_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_votes_itinerary_id_idx" ON "item_votes" USING btree ("itinerary_id");--> statement-breakpoint

----------------------------------------------------------------------------
-- Passo 4.2: voti, proposte, registro delle modifiche, notifiche.
-- Tutte le funzioni SECURITY DEFINER fissano search_path = public, pg_temp.
-- Errori di dominio: SQLSTATE P0001 con messaggio stabile; mancata autenticazione: 42501.
----------------------------------------------------------------------------

----------------------------------------------------------------------------
-- item_votes.itinerary_id: riempito dalla tappa al momento del voto (il client non lo scrive)
----------------------------------------------------------------------------

create or replace function public.item_votes_fill_itinerary()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_itinerary uuid;
begin
  select ii.itinerary_id into v_itinerary
  from public.itinerary_items ii
  where ii.id = new.itinerary_item_id;

  if v_itinerary is null then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  new.itinerary_id := v_itinerary;
  return new;
end;
$$;

revoke all on function public.item_votes_fill_itinerary() from public, anon, authenticated;

create trigger item_votes_fill_itinerary
  before insert on public.item_votes
  for each row execute function public.item_votes_fill_itinerary();

----------------------------------------------------------------------------
-- Helper: l'itinerario ha un gruppo e chi chiama ne è membro
----------------------------------------------------------------------------

create or replace function public.is_itinerary_group_member(iid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.itineraries i
    where i.id = iid
      and i.group_id is not null
      and public.is_group_member(i.group_id)
  );
$$;

revoke all on function public.is_itinerary_group_member(uuid) from public, anon;
grant execute on function public.is_itinerary_group_member(uuid) to authenticated;

----------------------------------------------------------------------------
-- Itinerari di gruppo: solo il proprietario del gruppo cambia l'attività di una tappa.
-- replace_group_stop passa da qui perché verifica lui stesso l'owner.
----------------------------------------------------------------------------

create or replace function public.itinerary_items_guard_activity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_group uuid;
begin
  select i.group_id into v_group
  from public.itineraries i
  where i.id = new.itinerary_id;

  if v_group is not null and not public.is_group_owner(v_group) then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.itinerary_items_guard_activity() from public, anon, authenticated;

create trigger itinerary_items_guard_activity
  before update of activity_id on public.itinerary_items
  for each row
  when (old.activity_id is distinct from new.activity_id)
  execute function public.itinerary_items_guard_activity();

----------------------------------------------------------------------------
-- REGISTRO DELLE MODIFICHE: immutabile (come points_ledger). Il delete a cascata con l'itinerario
-- e lo scollegamento dell'autore alla cancellazione dell'account (on delete set null) arrivano da
-- un trigger di foreign key (pg_trigger_depth() > 1): sono gli unici casi ammessi.
----------------------------------------------------------------------------

create or replace function public.itinerary_changes_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 and new.actor_id is null
    and old.actor_id is not null
    and new.id = old.id and new.itinerary_id = old.itinerary_id and new.kind = old.kind
    and new.payload = old.payload and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'itinerary_changes_immutable' using errcode = 'P0001';
end;
$$;

create trigger itinerary_changes_immutable
  before update or delete on public.itinerary_changes
  for each row execute function public.itinerary_changes_guard();

create trigger itinerary_changes_no_truncate
  before truncate on public.itinerary_changes
  for each statement execute function public.prevent_mutation();

----------------------------------------------------------------------------
-- RLS: REGISTRO, PROPOSTE, NOTIFICHE
----------------------------------------------------------------------------

alter table public.itinerary_changes enable row level security;
alter table public.itinerary_proposals enable row level security;
alter table public.notifications enable row level security;

revoke all on table public.itinerary_changes, public.itinerary_proposals, public.notifications
  from anon, authenticated;

-- itinerary_changes: lo leggono i membri del gruppo; lo scrive chi modifica il viaggio, come sé.
grant select on table public.itinerary_changes to authenticated;
grant insert (itinerary_id, actor_id, kind, payload) on table public.itinerary_changes to authenticated;

create policy itinerary_changes_select_members on public.itinerary_changes
  for select to authenticated
  using (public.is_itinerary_group_member(itinerary_id));

create policy itinerary_changes_insert_editor on public.itinerary_changes
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)
    and public.can_edit_itinerary(itinerary_id)
  );

-- itinerary_proposals: i membri vedono e propongono; la decisione passa da decide_proposal.
grant select on table public.itinerary_proposals to authenticated;
grant insert (itinerary_id, proposed_by, activity_id, day_index) on table public.itinerary_proposals to authenticated;

create policy itinerary_proposals_select_members on public.itinerary_proposals
  for select to authenticated
  using (public.is_itinerary_group_member(itinerary_id));

create policy itinerary_proposals_insert_member on public.itinerary_proposals
  for insert to authenticated
  with check (
    proposed_by = (select auth.uid())
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)
    and public.is_itinerary_group_member(itinerary_id)
    and exists (select 1 from public.activities a where a.id = activity_id and a.is_active)
  );

-- notifications: solo le proprie; il client segna come lette, le scrivono solo le funzioni.
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

----------------------------------------------------------------------------
-- FUNZIONI: decisione sulle proposte e sostituzione di una tappa (solo owner del gruppo)
----------------------------------------------------------------------------

-- Accetta o rifiuta una proposta. Accettata: la tappa entra in fondo al giorno proposto, il
-- registro ha 'proposal_accepted' (autore = owner). In ogni caso il proponente riceve una notifica.
create or replace function public.decide_proposal(p_proposal_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_proposal public.itinerary_proposals;
  v_group uuid;
  v_days smallint;
  v_owner uuid;
  v_title text;
  v_position smallint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;

  select * into v_proposal
  from public.itinerary_proposals
  where id = p_proposal_id
  for update;
  if not found then
    raise exception 'proposal_not_pending' using errcode = 'P0001';
  end if;

  select i.group_id, i.days, g.owner_id into v_group, v_days, v_owner
  from public.itineraries i
  left join public.groups g on g.id = i.group_id
  where i.id = v_proposal.itinerary_id;
  if v_group is null or v_owner is distinct from v_uid then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;

  if v_proposal.status <> 'pending' then
    raise exception 'proposal_not_pending' using errcode = 'P0001';
  end if;

  select a.title into v_title from public.activities a where a.id = v_proposal.activity_id;

  if p_accept then
    -- L'attività può essere stata disattivata dopo la proposta: solo attività attive entrano nel viaggio.
    if not exists (select 1 from public.activities a where a.id = v_proposal.activity_id and a.is_active) then
      raise exception 'activity_not_available' using errcode = 'P0001';
    end if;
    if v_proposal.day_index >= v_days then
      raise exception 'day_out_of_range' using errcode = 'P0001';
    end if;

    select coalesce(max(ii.position) + 1, 0)::smallint into v_position
    from public.itinerary_items ii
    where ii.itinerary_id = v_proposal.itinerary_id and ii.day_index = v_proposal.day_index;

    insert into public.itinerary_items (itinerary_id, day_index, position, activity_id, place_id)
    select v_proposal.itinerary_id, v_proposal.day_index, v_position, a.id, a.place_id
    from public.activities a
    where a.id = v_proposal.activity_id;

    insert into public.itinerary_changes (itinerary_id, actor_id, kind, payload)
    values (
      v_proposal.itinerary_id,
      v_uid,
      'proposal_accepted',
      jsonb_build_object('title', v_title, 'day', v_proposal.day_index + 1)
    );
  end if;

  update public.itinerary_proposals
  set status = case when p_accept then 'accepted' else 'rejected' end,
      decided_by = v_uid,
      decided_at = now()
  where id = v_proposal.id;

  if v_proposal.proposed_by is not null then
    insert into public.notifications (user_id, kind, payload)
    values (
      v_proposal.proposed_by,
      case when p_accept then 'proposal_accepted' else 'proposal_rejected' end,
      jsonb_build_object(
        'title', v_title,
        'day', v_proposal.day_index + 1,
        'itineraryId', v_proposal.itinerary_id
      )
    );
  end if;
end;
$$;

-- Sostituisce l'attività di una tappa di un gruppo (solo owner). Azzera il titolo libero e i voti
-- della tappa, perché i voti erano per l'attività precedente. Il registro ha titolo prima e dopo.
create or replace function public.replace_group_stop(p_item_id uuid, p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_itinerary uuid;
  v_day smallint;
  v_group uuid;
  v_owner uuid;
  v_before text;
  v_after text;
  v_place uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) then
    raise exception 'guest_not_allowed' using errcode = 'P0001';
  end if;

  select ii.itinerary_id, ii.day_index, i.group_id, g.owner_id,
    coalesce(a.title, ii.custom_title, pl.name)
  into v_itinerary, v_day, v_group, v_owner, v_before
  from public.itinerary_items ii
  join public.itineraries i on i.id = ii.itinerary_id
  left join public.groups g on g.id = i.group_id
  left join public.activities a on a.id = ii.activity_id
  left join public.places pl on pl.id = coalesce(ii.place_id, a.place_id)
  where ii.id = p_item_id
  for update of ii;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if v_group is null or v_owner is distinct from v_uid then
    raise exception 'not_group_owner' using errcode = 'P0001';
  end if;

  select a.title, a.place_id into v_after, v_place
  from public.activities a
  where a.id = p_activity_id and a.is_active;
  if not found then
    raise exception 'activity_not_available' using errcode = 'P0001';
  end if;

  update public.itinerary_items
  set activity_id = p_activity_id,
      place_id = v_place,
      custom_title = null
  where id = p_item_id;

  delete from public.item_votes where itinerary_item_id = p_item_id;

  insert into public.itinerary_changes (itinerary_id, actor_id, kind, payload)
  values (
    v_itinerary,
    v_uid,
    'stop_replaced',
    jsonb_build_object('before', v_before, 'after', v_after, 'day', v_day + 1)
  );
end;
$$;

revoke all on function public.decide_proposal(uuid, boolean), public.replace_group_stop(uuid, uuid)
  from public, anon;
grant execute on function public.decide_proposal(uuid, boolean), public.replace_group_stop(uuid, uuid)
  to authenticated;

----------------------------------------------------------------------------
-- REALTIME: broadcast privato sul topic "itinerary:<id>", autorizzato dalla RLS di realtime.messages
-- (solo i membri del gruppo del viaggio). Niente postgres_changes sulle tabelle del viaggio: per i
-- DELETE Realtime non applica la RLS e il filtro su itinerary_id non varrebbe. Il messaggio dice
-- solo quale tabella è cambiata; il client ricarica i dati dal server, dove valgono le policy.
----------------------------------------------------------------------------

create or replace function public.itinerary_realtime_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_itinerary uuid;
begin
  if tg_op = 'DELETE' then
    v_itinerary := old.itinerary_id;
  else
    v_itinerary := new.itinerary_id;
  end if;
  -- Solo i viaggi di gruppo hanno un topic sottoscrivibile: gli altri non generano messaggi.
  if not exists (
    select 1 from public.itineraries i
    where i.id = v_itinerary and i.group_id is not null
  ) then
    return null;
  end if;
  perform realtime.send(
    jsonb_build_object('table', tg_table_name, 'op', tg_op),
    'changed',
    'itinerary:' || v_itinerary::text,
    true
  );
  return null;
end;
$$;
revoke all on function public.itinerary_realtime_notify() from public, anon, authenticated;

create trigger itinerary_items_realtime
  after insert or update or delete on public.itinerary_items
  for each row execute function public.itinerary_realtime_notify();
create trigger item_votes_realtime
  after insert or update or delete on public.item_votes
  for each row execute function public.itinerary_realtime_notify();
create trigger itinerary_changes_realtime
  after insert on public.itinerary_changes
  for each row execute function public.itinerary_realtime_notify();
create trigger itinerary_proposals_realtime
  after insert or update on public.itinerary_proposals
  for each row execute function public.itinerary_realtime_notify();

-- Ricezione sul canale privato: solo i membri del gruppo del viaggio del topic.
create policy itinerary_topic_members_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    -- La riga deve essere del topic sottoscritto: un membro di un altro gruppo non legge questo viaggio.
    and realtime.messages.topic = (select realtime.topic())
    -- case: il cast a uuid avviene solo su un topic ben formato (l'ordine dell'and non è garantito).
    and case
      when (select realtime.topic()) ~ '^itinerary:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_itinerary_group_member(substring((select realtime.topic()) from 11)::uuid)
      else false
    end
  );
