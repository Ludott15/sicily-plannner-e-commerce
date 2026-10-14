ALTER TABLE "itinerary_nights" DROP CONSTRAINT "itinerary_nights_area_id_areas_id_fk";
--> statement-breakpoint
ALTER TABLE "itinerary_nights" DROP CONSTRAINT "itinerary_nights_place_id_places_id_fk";
--> statement-breakpoint
ALTER TABLE "itinerary_nights" ADD CONSTRAINT "itinerary_nights_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_nights" ADD CONSTRAINT "itinerary_nights_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;