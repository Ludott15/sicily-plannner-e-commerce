import { boolean, char, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { travelParty, tripPace, userRole } from "./enums";

// Una riga per utente, creata dal trigger on_auth_user_created.
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  locale: text("locale").notNull().default("it"),
  role: userRole("role").notNull().default("user"),
  homeAirportIata: char("home_airport_iata", { length: 3 }),
  pace: tripPace("pace"),
  party: travelParty("party"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  // Esclude l'utente dalla classifica stagionale (non da quella di gruppo).
  leaderboardOptOut: boolean("leaderboard_opt_out").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
