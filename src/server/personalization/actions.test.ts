import { beforeEach, describe, expect, it, vi } from "vitest";

// Prova a rovescio del limite degli ospiti in onboarding (passo 11.5, revisione B1): con il contatore a
// limite nessuna sessione anonima e nessuna risposta salvata; con il contatore non disponibile si nega.

const guestSessionDecision = vi.fn();
const signInAnonymously = vi.fn();
const saveAnswers = vi.fn();
const setConsent = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ publicEnv: { NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "test" } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/server/auth", () => ({ getUser: async () => null, requireUser: vi.fn() }));
vi.mock("@/server/supabase/server", () => ({
  createClient: async () => ({ auth: { signInAnonymously } }),
}));
vi.mock("@/server/security/guest-limit", () => ({ guestSessionDecision: () => guestSessionDecision() }));
vi.mock("@/server/privacy/consents", () => ({ setConsent: (...args: unknown[]) => setConsent(...args), withdrawConsent: vi.fn() }));
vi.mock("./data", () => ({
  clearSensitivePreferences: vi.fn(),
  getSavedPreferences: vi.fn(),
  saveAnswers: (...args: unknown[]) => saveAnswers(...args),
  saveExtraPreferences: vi.fn(),
  saveTastes: vi.fn(),
  saveTrip: vi.fn(),
}));

import { submitOnboarding } from "./actions";

const input = {
  locale: "it" as const,
  interests: [],
  weights: {},
  pace: null,
  days: null,
  months: [],
  party: null,
  airport: null,
  budgetPerDayEur: null,
  car: null,
  captchaToken: "token",
};

beforeEach(() => {
  vi.clearAllMocks();
  signInAnonymously.mockResolvedValue({ data: { user: { id: "guest-1" } }, error: null });
});

describe("submitOnboarding: ospiti", () => {
  it("contatore a limite: rate_limited, nessuna sessione anonima e nessuna risposta salvata", async () => {
    guestSessionDecision.mockResolvedValue("limited");
    await expect(submitOnboarding(input)).resolves.toEqual({ status: "error", code: "rate_limited" });
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(saveAnswers).not.toHaveBeenCalled();
    expect(setConsent).not.toHaveBeenCalled();
  });

  it("contatore non disponibile: fail closed, failed e nessuna scrittura", async () => {
    guestSessionDecision.mockResolvedValue("unavailable");
    await expect(submitOnboarding(input)).resolves.toEqual({ status: "error", code: "failed" });
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(saveAnswers).not.toHaveBeenCalled();
  });
});
