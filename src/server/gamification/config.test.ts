import { describe, expect, it } from "vitest";
import { CHECK_IN_RADIUS_M, CHECK_INS_PER_DAY, ITINERARY_CHECK_INS_MIN, POINT_DEFAULTS, REPORT_REASONS, REVIEW_MIN_CHARS } from "./config";

// I valori devono restare quelli del passo 5.1: le stesse soglie sono letterali nelle funzioni
// SQL (record_check_in, submit_review) e i punti nella tabella point_rules.
describe("configurazione dei punti", () => {
  it("i punti di default coincidono con point_rules", () => {
    expect(POINT_DEFAULTS).toEqual({
      profile_completed: 50,
      invite_accepted: 100,
      itinerary_completed: 100,
      review: 20,
      check_in: 10,
    });
  });

  it("le soglie dei check-in e delle recensioni", () => {
    expect(CHECK_IN_RADIUS_M).toBe(300);
    expect(CHECK_INS_PER_DAY).toBe(5);
    expect(ITINERARY_CHECK_INS_MIN).toBe(3);
    expect(REVIEW_MIN_CHARS).toBe(80);
  });

  it("i motivi di segnalazione", () => {
    expect(REPORT_REASONS).toEqual(["spam", "offensive", "off_topic", "other"]);
  });
});
