import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const tripPace = pgEnum("trip_pace", ["relaxed", "balanced", "intense"]);
export const travelParty = pgEnum("travel_party", ["solo", "couple", "family", "friends"]);
export const partner = pgEnum("partner", [
  "travelpayouts",
  "getyourguide",
  "viator",
  "car_rental",
  "internal",
]);
export const eventType = pgEnum("event_type", [
  "view",
  "save",
  "unsave",
  "add_to_itinerary",
  "remove_from_itinerary",
  "affiliate_click",
  "vote_up",
  "vote_down",
  "review",
]);
