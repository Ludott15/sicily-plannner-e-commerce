CREATE TABLE "area_drive_times" (
	"area_a_id" uuid NOT NULL,
	"area_b_id" uuid NOT NULL,
	"minutes" smallint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "area_drive_times_area_a_id_area_b_id_pk" PRIMARY KEY("area_a_id","area_b_id"),
	CONSTRAINT "area_drive_times_order" CHECK ("area_drive_times"."area_a_id" < "area_drive_times"."area_b_id"),
	CONSTRAINT "area_drive_times_minutes" CHECK ("area_drive_times"."minutes" between 1 and 600)
);
--> statement-breakpoint
ALTER TABLE "area_drive_times" ADD CONSTRAINT "area_drive_times_area_a_id_areas_id_fk" FOREIGN KEY ("area_a_id") REFERENCES "public"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_drive_times" ADD CONSTRAINT "area_drive_times_area_b_id_areas_id_fk" FOREIGN KEY ("area_b_id") REFERENCES "public"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Tempi di guida tra aree (M4 parte 4): RLS e grant della tabella area_drive_times.
-- La tabella è definita in src/server/db/schema/drive-times.ts (db:generate la crea).
-- Lettura pubblica (il motore la legge con dbPublic). Nessuna scrittura per anon e authenticated:
-- la scrive solo l'admin con dbAdmin (src/server/catalog/drive-times.admin.ts). Senza grant di
-- scrittura e senza policy di scrittura, un client che tenta di scrivere riceve 42501.

alter table public.area_drive_times enable row level security;
revoke all on table public.area_drive_times from anon, authenticated;
grant select on table public.area_drive_times to anon, authenticated;

create policy area_drive_times_select_all on public.area_drive_times
  for select to anon, authenticated
  using (true);
