CREATE TABLE "affiliate_partners" (
	"partner" "partner" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"verticals" text[] NOT NULL,
	"search_url_template" text,
	"allowed_hosts" text[] DEFAULT '{}' NOT NULL,
	"subid_param" text,
	"partner_id_env" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_partners_partner_not_internal" CHECK ("affiliate_partners"."partner" <> 'internal'),
	CONSTRAINT "affiliate_partners_verticals_valid" CHECK (cardinality("affiliate_partners"."verticals") > 0 and "affiliate_partners"."verticals" <@ array['activity','lodging','car','flight']::text[]),
	CONSTRAINT "affiliate_partners_template_https" CHECK ("affiliate_partners"."search_url_template" is null or "affiliate_partners"."search_url_template" ~ '^https://'),
	CONSTRAINT "affiliate_partners_subid_param_format" CHECK ("affiliate_partners"."subid_param" is null or "affiliate_partners"."subid_param" ~ '^[a-z][a-z0-9_]{0,19}$'),
	CONSTRAINT "affiliate_partners_partner_id_env_format" CHECK ("affiliate_partners"."partner_id_env" is null or "affiliate_partners"."partner_id_env" ~ '^[A-Z][A-Z0-9_]*$'),
	CONSTRAINT "affiliate_partners_active_has_hosts" CHECK (not "affiliate_partners"."is_active" or cardinality("affiliate_partners"."allowed_hosts") > 0)
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_hits_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
-- Da accodare alla migrazione Drizzle che crea affiliate_partners e rate_limit_hits (le tabelle
-- sono in src/server/db/schema/affiliates.ts). Eseguita dopo custom-1-enum.sql.

----------------------------------------------------------------------------
-- AFFILIATE_PARTNERS
-- Client (anon e authenticated): solo partner, name, verticals, is_active, e solo per le
-- righe attive. Template, host, parametro e nome della variabile d'ambiente non sono leggibili
-- dal client: li legge il server con affiliate_partner_config o con dbAdmin nei file .admin.ts.
-- Scrittura: solo admin, su nome, verticali, template, host, parametro, variabile e stato.
----------------------------------------------------------------------------
alter table public.affiliate_partners enable row level security;
revoke all on table public.affiliate_partners from anon, authenticated;
grant select (partner, name, verticals, is_active) on table public.affiliate_partners to anon, authenticated;
grant update (name, verticals, search_url_template, allowed_hosts, subid_param, partner_id_env, is_active, updated_at)
  on table public.affiliate_partners to authenticated;

create policy affiliate_partners_select_anon on public.affiliate_partners
  for select to anon
  using (is_active);

create policy affiliate_partners_select_authenticated on public.affiliate_partners
  for select to authenticated
  using (is_active or (select public.is_admin()));

create policy affiliate_partners_update_admin on public.affiliate_partners
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

----------------------------------------------------------------------------
-- RATE_LIMIT_HITS: nessun grant e nessuna policy per anon e authenticated. Si scrive e si
-- legge solo da hit_rate_limit (SECURITY DEFINER, owner postgres).
----------------------------------------------------------------------------
alter table public.rate_limit_hits enable row level security;
revoke all on table public.rate_limit_hits from anon, authenticated;

-- Righe base. Configurazione, non dati demo: il seed non le tocca.
-- I template e i nomi dei parametri sono da confermare con i termini di ogni programma
-- prima del lancio (docs/LANCIO.md); l'admin li modifica da /admin/partner.
-- Travelpayouts (voli): il link dei voli lo costruisce src/server/flights (contratto 2.1),
-- quindi nessun template qui. Car rental: solo offerte inserite a mano, non collegato: inattivo.
insert into public.affiliate_partners
  (partner, name, verticals, search_url_template, allowed_hosts, subid_param, partner_id_env, is_active)
values
  ('travelpayouts', 'Aviasales', '{flight}', null, '{www.aviasales.com}', 'sub_id', 'TRAVELPAYOUTS_MARKER', true),
  ('getyourguide', 'GetYourGuide', '{activity}', null, '{www.getyourguide.com}', 'cmp', 'GETYOURGUIDE_PARTNER_ID', true),
  ('viator', 'Viator', '{activity}', null, '{www.viator.com}', 'campaign', 'VIATOR_PARTNER_ID', true),
  ('civitatis', 'Civitatis', '{activity}', null, '{www.civitatis.com}', 'aid', 'CIVITATIS_AGENCY_ID', true),
  ('booking', 'Booking.com', '{lodging}',
    'https://www.booking.com/searchresults.html?ss={query}&checkin={checkin}&checkout={checkout}&group_adults={adults}&aid={partner_id}&label={subid}&lang={locale}',
    '{www.booking.com}', 'label', 'BOOKING_AFFILIATE_ID', true),
  ('discovercars', 'DiscoverCars', '{car}',
    'https://www.discovercars.com/search?location={airport}&pickup_date={checkin}&dropoff_date={checkout}&a_aid={partner_id}&data1={subid}',
    '{www.discovercars.com}', 'data1', 'DISCOVERCARS_AFFILIATE_ID', true),
  ('car_rental', 'Noleggio (offerte manuali)', '{car}', null, '{}', null, null, false)
on conflict (partner) do nothing;
