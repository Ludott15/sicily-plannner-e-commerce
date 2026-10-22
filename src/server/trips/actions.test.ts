import { beforeEach, describe, expect, it, vi } from "vitest";

// Prova a rovescio del limite degli ospiti nella creazione di un viaggio (passo 11.5, revisione B1):
// sessionUser è il punto in cui si crea l'ospite. Con il contatore a limite non si crea nulla.

const guestSessionDecision = vi.fn();
const signInAnonymously = vi.fn();
const saveTrip = vi.fn();

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
vi.mock("@/server/personalization/data", () => ({
  areaNames: vi.fn(),
  driveTimesBySlug: vi.fn(),
  engineCatalog: vi.fn(),
  getSavedPreferences: vi.fn(async () => null),
  personalProfile: vi.fn(),
  saveTrip: (...args: unknown[]) => saveTrip(...args),
}));

import { startTrip } from "./actions";

const input = {
  locale: "it" as const,
  source: { kind: "template" as const, slug: "demo-zingaro" },
  startDate: null,
  travelers: null,
  captchaToken: "token",
};

beforeEach(() => {
  vi.clearAllMocks();
  signInAnonymously.mockResolvedValue({ data: { user: { id: "guest-1" } }, error: null });
});

describe("startTrip: sessione ospite", () => {
  it("contatore a limite: rate_limited, nessun ospite e nessun viaggio creato", async () => {
    guestSessionDecision.mockResolvedValue("limited");
    await expect(startTrip(input)).resolves.toEqual({ status: "error", code: "rate_limited" });
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(saveTrip).not.toHaveBeenCalled();
  });

  it("contatore non disponibile: fail closed, failed e nessun ospite", async () => {
    guestSessionDecision.mockResolvedValue("unavailable");
    await expect(startTrip(input)).resolves.toEqual({ status: "error", code: "failed" });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });
});
