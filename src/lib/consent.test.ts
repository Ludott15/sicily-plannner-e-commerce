import { describe, expect, it } from "vitest";
import { consentCookie, hasAnalyticsConsent, parseConsent } from "./consent";

describe("consenso ai cookie", () => {
  it("solo accepted o rejected sono scelte valide", () => {
    expect(parseConsent("accepted")).toBe("accepted");
    expect(parseConsent("rejected")).toBe("rejected");
    expect(parseConsent("yes")).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });

  it("analisi solo con il consenso esplicito", () => {
    expect(hasAnalyticsConsent("accepted")).toBe(true);
    expect(hasAnalyticsConsent("rejected")).toBe(false);
    expect(hasAnalyticsConsent(null)).toBe(false);
  });

  it("cookie tecnico di sei mesi, Secure in https", () => {
    expect(consentCookie("rejected", false)).toBe("cookie_consent=rejected; Max-Age=15724800; Path=/; SameSite=Lax");
    expect(consentCookie("accepted", true)).toMatch(/; Secure$/);
  });
});
