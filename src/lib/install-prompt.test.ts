import { describe, expect, it } from "vitest";
import { shouldOfferInstall } from "./install-prompt";

const base = { trips: 2, inApp: false, standalone: false, dismissed: false };

describe("shouldOfferInstall", () => {
  it("mostra l'invito con almeno due viaggi nel browser normale", () => {
    expect(shouldOfferInstall(base)).toBe(true);
  });

  it("non lo mostra al primo accesso", () => {
    expect(shouldOfferInstall({ ...base, trips: 0 })).toBe(false);
    expect(shouldOfferInstall({ ...base, trips: 1 })).toBe(false);
  });

  it("non lo mostra nei browser interni delle app", () => {
    expect(shouldOfferInstall({ ...base, inApp: true })).toBe(false);
  });

  it("non lo mostra se l'app è già installata", () => {
    expect(shouldOfferInstall({ ...base, standalone: true })).toBe(false);
  });

  it("non lo mostra dopo 'Non ora'", () => {
    expect(shouldOfferInstall({ ...base, dismissed: true })).toBe(false);
  });
});
