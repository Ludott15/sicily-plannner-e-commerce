import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const tripPace = pgEnum("trip_pace", ["relaxed", "balanced", "intense"]);
export const travelParty = pgEnum("travel_party", ["solo", "couple", "family", "friends"]);
// Ora indicativa di una tappa dell'itinerario (editor admin e builder): mattina, pranzo, pomeriggio, sera.
export const timeSlot = pgEnum("time_slot", ["morning", "lunch", "afternoon", "evening"]);
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
export const itineraryStatus = pgEnum("itinerary_status", [
  "draft",
  "planned",
  "in_progress",
  "completed",
]);
export const groupRole = pgEnum("group_role", ["owner", "member"]);
export const inviteStatus = pgEnum("invite_status", ["active", "revoked", "expired"]);
export const pointReason = pgEnum("point_reason", [
  "profile_completed",
  "invite_accepted",
  "review",
  "check_in",
  "itinerary_completed",
  "order",
  "redeem",
  "redeem_refund",
  "admin_adjust",
]);
export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "sent_to_producer",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);
export const localTipAuthorKind = pgEnum("local_tip_author_kind", ["editorial", "person"]);
// Auto nel viaggio: propria, a noleggio, nessuna (onboarding, domanda "Budget e spostamenti").
export const carAccess = pgEnum("car_access", ["own", "rental", "none"]);
// Prenotazioni dell'itinerario (checklist "Da prenotare", M5): cosa si prenota e se l'utente
// l'ha segnato come fatto. Lo stato lo segna l'utente, non riceviamo conferme dai partner.
export const bookingKind = pgEnum("booking_kind", ["activity", "lodging", "car", "flight"]);
export const bookingStatus = pgEnum("booking_status", ["to_book", "booked"]);
// Immagini del catalogo: foto vera o illustrazione, e da dove viene (docs/IMMAGINI.md).
export const mediaKind = pgEnum("media_kind", ["photo", "illustration"]);
export const mediaSourceType = pgEnum("media_source_type", ["own", "licensed", "partner", "illustration"]);
