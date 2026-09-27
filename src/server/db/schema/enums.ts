import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const tripPace = pgEnum("trip_pace", ["relaxed", "balanced", "intense"]);
export const travelParty = pgEnum("travel_party", ["solo", "couple", "family", "friends"]);
