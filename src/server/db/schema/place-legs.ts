import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { places } from "./catalog";

// Tratta stradale tra due luoghi (mappa degli itinerari): una riga per coppia ORDINATA (da, a).
// Il viaggio A→B e B→A sono righe diverse: il percorso e la direzione (sensi unici, freccia della
// mappa) cambiano, e le coppie reali sono poche. Coppia assente = tratta non ancora calcolata.
// Scritta solo dal cron route-legs e da npm run maps:legs con dbAdmin (src/server/maps/legs.admin.ts);
// letta con dbPublic (src/server/maps/legs.ts). La geometria è [lng, lat], semplificata a circa 30 m
// e limitata a 400 punti (vincolo di tabella).
export const placeLegs = pgTable(
  "place_legs",
  {
    fromPlaceId: uuid("from_place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    toPlaceId: uuid("to_place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    distanceM: integer("distance_m").notNull(),
    durationS: integer("duration_s").notNull(),
    geometry: jsonb("geometry").$type<[number, number][]>().notNull(),
    source: text("source").notNull().default("osrm"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.fromPlaceId, t.toPlaceId] }),
    check("place_legs_distinct_places", sql`${t.fromPlaceId} <> ${t.toPlaceId}`),
    check("place_legs_distance_non_negative", sql`${t.distanceM} >= 0`),
    check("place_legs_duration_non_negative", sql`${t.durationS} >= 0`),
    check("place_legs_source_osrm", sql`${t.source} = 'osrm'`),
    check(
      "place_legs_geometry_size",
      sql`case when jsonb_typeof(${t.geometry}) = 'array' then jsonb_array_length(${t.geometry}) between 2 and 400 else false end`,
    ),
  ],
);
