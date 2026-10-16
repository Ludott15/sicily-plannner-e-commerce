import { describe, expect, it } from "vitest";
import { badgeCriteriaSchema, BADGE_KEY_PATTERN, describeCriteria, INITIAL_BADGES } from "@/lib/badges";

describe("badgeCriteriaSchema", () => {
  it("accetta ogni tipo di criterio valido", () => {
    const valid = [
      { type: "itineraries_completed", min: 1 },
      { type: "check_ins_in_province", province: "CT", min: 5 },
      { type: "provinces_checked_in", min: 9 },
      { type: "interest_activities_completed", interest: "food_wine", min: 5 },
      { type: "group_size", min: 4 },
      { type: "points_total", min: 500 },
    ];
    for (const criteria of valid) {
      expect(badgeCriteriaSchema.safeParse(criteria).success).toBe(true);
    }
  });

  it("rifiuta un tipo sconosciuto", () => {
    expect(badgeCriteriaSchema.safeParse({ type: "bogus", min: 1 }).success).toBe(false);
  });

  it("rifiuta chiavi in più e soglie non valide", () => {
    expect(badgeCriteriaSchema.safeParse({ type: "itineraries_completed", min: 1, extra: true }).success).toBe(false);
    expect(badgeCriteriaSchema.safeParse({ type: "itineraries_completed", min: 0 }).success).toBe(false);
    expect(badgeCriteriaSchema.safeParse({ type: "itineraries_completed", min: 1.5 }).success).toBe(false);
  });

  it("accetta solo le sigle delle province siciliane", () => {
    expect(badgeCriteriaSchema.safeParse({ type: "check_ins_in_province", province: "XX", min: 1 }).success).toBe(false);
    expect(badgeCriteriaSchema.safeParse({ type: "check_ins_in_province", province: "TP", min: 1 }).success).toBe(true);
  });

  it("rifiuta un interesse con caratteri non ammessi", () => {
    expect(
      badgeCriteriaSchema.safeParse({ type: "interest_activities_completed", interest: "Cibo e vino", min: 1 }).success,
    ).toBe(false);
  });

  it("limita il numero di membri del gruppo a 2-30", () => {
    expect(badgeCriteriaSchema.safeParse({ type: "group_size", min: 1 }).success).toBe(false);
    expect(badgeCriteriaSchema.safeParse({ type: "group_size", min: 31 }).success).toBe(false);
  });
});

describe("describeCriteria", () => {
  it("restituisce la chiave di traduzione e i valori per ogni tipo", () => {
    expect(describeCriteria({ type: "itineraries_completed", min: 1 })).toEqual({
      key: "itineraries_completed",
      values: { min: 1 },
    });
    expect(describeCriteria({ type: "check_ins_in_province", province: "CT", min: 5 })).toEqual({
      key: "check_ins_in_province",
      values: { province: "CT", min: 5 },
    });
    expect(describeCriteria({ type: "provinces_checked_in", min: 9 })).toEqual({
      key: "provinces_checked_in",
      values: { min: 9 },
    });
    expect(describeCriteria({ type: "interest_activities_completed", interest: "food_wine", min: 5 })).toEqual({
      key: "interest_activities_completed",
      values: { interest: "food_wine", min: 5 },
    });
    expect(describeCriteria({ type: "group_size", min: 4 })).toEqual({
      key: "group_size",
      values: { min: 4 },
    });
    expect(describeCriteria({ type: "points_total", min: 500 })).toEqual({
      key: "points_total",
      values: { min: 500 },
    });
  });
});

describe("badge iniziali", () => {
  it("hanno chiavi valide, criteri validi e nomi con parole entro 16 caratteri", () => {
    const keys = INITIAL_BADGES.map((badge) => badge.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const badge of INITIAL_BADGES) {
      expect(BADGE_KEY_PATTERN.test(badge.key)).toBe(true);
      expect(badgeCriteriaSchema.safeParse(badge.criteria).success).toBe(true);
      for (const name of [badge.nameIt, badge.nameEn]) {
        for (const word of name.split(" ")) {
          expect(word.length).toBeLessThanOrEqual(16);
        }
      }
    }
  });
});
