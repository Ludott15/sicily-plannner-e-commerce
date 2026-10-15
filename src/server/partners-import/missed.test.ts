import { describe, expect, it } from "vitest";
import { MISSED_IMPORTS_LIMIT, planMissedUpdates, type OfferCounter } from "./missed";

const offer = (partial: Partial<OfferCounter> = {}): OfferCounter => ({
  id: "o-1",
  partnerProductId: "P1",
  missedImports: 0,
  isActive: true,
  ...partial,
});

describe("planMissedUpdates", () => {
  it("non tocca le offerte viste nell'import", () => {
    expect(planMissedUpdates([offer()], new Set(["P1"]))).toEqual([]);
  });

  it("incrementa le offerte attive non viste", () => {
    expect(planMissedUpdates([offer()], new Set())).toEqual([{ id: "o-1", missedImports: 1, isActive: true }]);
  });

  it("disattiva alla soglia di 3 import mancati", () => {
    expect(MISSED_IMPORTS_LIMIT).toBe(3);
    expect(planMissedUpdates([offer({ missedImports: 1 })], new Set())[0]).toEqual({
      id: "o-1",
      missedImports: 2,
      isActive: true,
    });
    expect(planMissedUpdates([offer({ missedImports: 2 })], new Set())[0]).toEqual({
      id: "o-1",
      missedImports: 3,
      isActive: false,
    });
  });

  it("ignora le offerte già inattive", () => {
    expect(planMissedUpdates([offer({ isActive: false, missedImports: 3 })], new Set())).toEqual([]);
  });
});
