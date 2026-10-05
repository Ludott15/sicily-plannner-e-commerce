CREATE TABLE "activity_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"partner" "partner" NOT NULL,
	"partner_product_id" text NOT NULL,
	"title" text NOT NULL,
	"price_from_eur" numeric(8, 2),
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"affiliate_url" text NOT NULL,
	"rating" numeric(2, 1),
	"reviews_count" integer,
	"free_cancellation" boolean,
	"price_updated_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_offers_partner_product_unique" UNIQUE("partner","partner_product_id"),
	CONSTRAINT "activity_offers_partner_not_internal" CHECK ("activity_offers"."partner" <> 'internal'),
	CONSTRAINT "activity_offers_affiliate_url_https" CHECK ("activity_offers"."affiliate_url" ~ '^https://'),
	CONSTRAINT "activity_offers_price_non_negative" CHECK ("activity_offers"."price_from_eur" >= 0),
	CONSTRAINT "activity_offers_currency_format" CHECK ("activity_offers"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "activity_offers_rating_range" CHECK ("activity_offers"."rating" between 0 and 5),
	CONSTRAINT "activity_offers_reviews_count_non_negative" CHECK ("activity_offers"."reviews_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "on_site_price_eur" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD COLUMN "offer_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_offers" ADD CONSTRAINT "activity_offers_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_offers_activity_id_idx" ON "activity_offers" USING btree ("activity_id");--> statement-breakpoint
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_offer_id_activity_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."activity_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_on_site_price_non_negative" CHECK ("activities"."on_site_price_eur" >= 0);--> statement-breakpoint

-- Offerte dei partner (schema 2e). Visibili a tutti se attive e di un'attività attiva;
-- l'admin vede e scrive tutto. L'affiliate_url è leggibile: /api/go lo usa per costruire
-- l'URL finale, che record_affiliate_click confronta con quello salvato qui.
alter table public.activity_offers enable row level security;
revoke all on table public.activity_offers from anon, authenticated;
grant select on table public.activity_offers to anon, authenticated;
grant insert, update, delete on table public.activity_offers to authenticated;

create policy activity_offers_select_anon on public.activity_offers
  for select to anon
  using (
    is_active
    and exists (select 1 from public.activities a where a.id = activity_id and a.is_active)
  );

create policy activity_offers_select_authenticated on public.activity_offers
  for select to authenticated
  using (
    (select public.is_admin())
    or (
      is_active
      and exists (select 1 from public.activities a where a.id = activity_id and a.is_active)
    )
  );

create policy activity_offers_insert_admin on public.activity_offers
  for insert to authenticated with check ((select public.is_admin()));
create policy activity_offers_update_admin on public.activity_offers
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy activity_offers_delete_admin on public.activity_offers
  for delete to authenticated using ((select public.is_admin()));

-- Dati esistenti: il prezzo dell'attività diventa il prezzo in loco; ogni link affiliato
-- diventa un'offerta con il titolo dell'attività (da correggere dall'admin). Le colonne
-- vecchie si eliminano nella migrazione successiva.
update public.activities set on_site_price_eur = price_from_eur;

insert into public.activity_offers (activity_id, partner, partner_product_id, title, affiliate_url, is_active)
select a.id, a.partner, coalesce(a.partner_product_id, a.slug), a.title, a.affiliate_url, true
from public.activities a
where a.affiliate_url is not null
  and a.partner <> 'internal'
  and a.affiliate_url ~ '^https://';

-- Click affiliato su un'offerta (sostituisce la versione sull'attività). La funzione verifica
-- che offerta e attività siano attive e che l'URL finale parta dall'affiliate_url
-- dell'offerta: nessun URL arbitrario entra nel registro né viene usato per il redirect.
-- L'utente è auth.uid() (null per gli anonimi), mai un parametro.
drop function public.record_affiliate_click(uuid, text, text, text, text, uuid);

create function public.record_affiliate_click(
  p_offer_id uuid,
  p_subid text,
  p_target_url text,
  p_context text,
  p_anon_id text default null,
  p_itinerary_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_offer public.activity_offers;
begin
  select o.* into v_offer
  from public.activity_offers o
  join public.activities a on a.id = o.activity_id
  where o.id = p_offer_id and o.is_active and a.is_active;
  if not found then
    raise exception 'offer_not_bookable' using errcode = 'P0001';
  end if;

  if left(p_target_url, length(v_offer.affiliate_url)) <> v_offer.affiliate_url then
    raise exception 'target_mismatch' using errcode = 'P0001';
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

  insert into public.affiliate_clicks
    (user_id, activity_id, offer_id, partner, target_url, subid, context, itinerary_id, anon_id)
  values
    (v_uid, v_offer.activity_id, v_offer.id, v_offer.partner, p_target_url, p_subid, p_context, p_itinerary_id, p_anon_id);

  if v_uid is not null then
    insert into public.user_events (user_id, type, activity_id, itinerary_id)
    values (v_uid, 'affiliate_click', v_offer.activity_id, p_itinerary_id);
  end if;
end;
$$;

revoke all on function public.record_affiliate_click(uuid, text, text, text, text, uuid) from public;
grant execute on function public.record_affiliate_click(uuid, text, text, text, text, uuid) to anon, authenticated;
