CREATE TYPE "public"."local_tip_author_kind" AS ENUM('editorial', 'person');--> statement-breakpoint
CREATE TABLE "local_tip_authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "local_tip_author_kind" NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"photo_url" text,
	"profile_id" uuid,
	"consent_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_tip_authors_person_consent" CHECK ("local_tip_authors"."kind" <> 'person' or "local_tip_authors"."consent_at" is not null),
	CONSTRAINT "local_tip_authors_photo_https" CHECK ("local_tip_authors"."photo_url" ~ '^https://')
);
--> statement-breakpoint
CREATE TABLE "local_tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"activity_id" uuid,
	"place_id" uuid,
	"body" text NOT NULL,
	"author_relation" text,
	"verified_at" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_tips_target" CHECK ("local_tips"."activity_id" is not null or "local_tips"."place_id" is not null),
	CONSTRAINT "local_tips_body_length" CHECK (char_length("local_tips"."body") between 1 and 280)
);
--> statement-breakpoint
ALTER TABLE "local_tip_authors" ADD CONSTRAINT "local_tip_authors_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_tips" ADD CONSTRAINT "local_tips_author_id_local_tip_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."local_tip_authors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_tips" ADD CONSTRAINT "local_tips_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_tips" ADD CONSTRAINT "local_tips_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_tips_activity_id_idx" ON "local_tips" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "local_tips_place_id_idx" ON "local_tips" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "local_tips_verified_at_idx" ON "local_tips" USING btree ("verified_at");--> statement-breakpoint

-- Tabelle dei consigli: solo admin. Il pubblico legge dalla vista public_local_tips.
alter table public.local_tip_authors enable row level security;
alter table public.local_tips enable row level security;
revoke all on table public.local_tip_authors, public.local_tips from anon, authenticated;
grant select, insert, update, delete on table public.local_tip_authors, public.local_tips to authenticated;

create policy local_tip_authors_select_admin on public.local_tip_authors
  for select to authenticated using ((select public.is_admin()));
create policy local_tip_authors_insert_admin on public.local_tip_authors
  for insert to authenticated with check ((select public.is_admin()));
create policy local_tip_authors_update_admin on public.local_tip_authors
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy local_tip_authors_delete_admin on public.local_tip_authors
  for delete to authenticated using ((select public.is_admin()));

create policy local_tips_select_admin on public.local_tips
  for select to authenticated using ((select public.is_admin()));
create policy local_tips_insert_admin on public.local_tips
  for insert to authenticated with check ((select public.is_admin()));
create policy local_tips_update_admin on public.local_tips
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy local_tips_delete_admin on public.local_tips
  for delete to authenticated using ((select public.is_admin()));

-- Un consiglio firmato da una persona ha sempre la relazione con il luogo; senza, si firma
-- come redazione (LocalTip/README.md). Vale anche se un autore diventa "person".
create function public.local_tips_person_relation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.local_tip_authors a where a.id = new.author_id and a.kind = 'person')
     and coalesce(btrim(new.author_relation), '') = '' then
    raise exception 'person_tip_without_relation' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger local_tips_person_relation
  before insert or update on public.local_tips
  for each row execute function public.local_tips_person_relation();

create function public.local_tip_authors_person_relation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
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

create trigger local_tip_authors_person_relation
  before update of kind on public.local_tip_authors
  for each row execute function public.local_tip_authors_person_relation();

-- Vista pubblica: consigli attivi, di autori attivi, verificati negli ultimi 12 mesi; solo
-- i campi pubblici dell'autore (tipo, nome, foto). Niente consigli di attività inattive.
create view public.public_local_tips
with (security_barrier = true)
as
select
  t.id,
  t.activity_id,
  t.place_id,
  t.body,
  t.author_relation,
  t.verified_at,
  a.kind as author_kind,
  a.display_name as author_name,
  a.photo_url as author_photo_url
from public.local_tips t
join public.local_tip_authors a on a.id = t.author_id and a.is_active
left join public.activities act on act.id = t.activity_id
where t.is_active
  and t.verified_at > current_date - interval '12 months'
  and (t.activity_id is null or act.is_active);

revoke all on public.public_local_tips from anon, authenticated;
grant select on public.public_local_tips to anon, authenticated;

-- Coda "Da riverificare" dell'admin: consigli attivi che scadono entro 30 giorni o già
-- scaduti (usciti dalle pagine). security_invoker: valgono le policy delle tabelle (admin).
create view public.local_tips_due_for_review
with (security_invoker = true)
as
select
  t.id,
  t.author_id,
  t.activity_id,
  t.place_id,
  t.body,
  t.verified_at,
  (t.verified_at + interval '12 months')::date as expires_on
from public.local_tips t
where t.is_active
  and t.verified_at + interval '12 months' <= current_date + interval '30 days';

revoke all on public.local_tips_due_for_review from anon, authenticated;
grant select on public.local_tips_due_for_review to authenticated;
