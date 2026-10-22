import { beforeEach, describe, expect, it, vi } from "vitest";

// Prova a rovescio dei limiti di accesso (passo 11.5, revisione B1): quando il contatore nega, nessuna
// chiamata a Supabase; quando non risponde, si nega (fail closed). I contatori sono mock: la prova
// con il database reale sta in actions.int.test.ts.

const checkRates = vi.fn();
const getUser = vi.fn();
const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const signInAnonymously = vi.fn();
const updateUser = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "198.51.100.9" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/env", () => ({ publicEnv: { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" } }));
vi.mock("@/server/auth", () => ({ getUser: () => getUser() }));
vi.mock("@/server/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithOtp, verifyOtp, signInAnonymously, updateUser },
  }),
}));
vi.mock("@/server/security/rate-limit", () => ({
  AUTH_RULES: {
    sendCodeIp: { scope: "auth:send:ip", limit: 30, windowSeconds: 3600 },
    sendCodeEmail: { scope: "auth:send:email", limit: 5, windowSeconds: 3600 },
    verifyIp: { scope: "auth:verify:ip", limit: 60, windowSeconds: 900 },
    verifyEmail: { scope: "auth:verify:email", limit: 10, windowSeconds: 900 },
    guestIp: { scope: "auth:guest:ip", limit: 30, windowSeconds: 3600 },
  },
  ipIdentity: (headers: Headers) => headers.get("x-real-ip"),
  checkRates: (...args: unknown[]) => checkRates(...args),
}));

import { sendEmailCode, sendGuestEmailCode, startGuestSession, verifyEmailCode, verifyGuestEmailCode } from "./actions";

const EMAIL = "mario.rossi@example.com";

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue(null);
  signInWithOtp.mockResolvedValue({ error: null });
  verifyOtp.mockResolvedValue({ error: null });
  signInAnonymously.mockResolvedValue({ error: null });
  updateUser.mockResolvedValue({ error: null });
});

describe("sendEmailCode", () => {
  const input = { email: EMAIL, locale: "it", captchaToken: "token" };

  it("contatore a limite: rate_limited e nessun invio", async () => {
    checkRates.mockResolvedValue("limited");
    await expect(sendEmailCode(input)).resolves.toEqual({ status: "error", code: "rate_limited" });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("contatore non disponibile: fail closed, failed e nessun invio", async () => {
    checkRates.mockResolvedValue("unavailable");
    await expect(sendEmailCode(input)).resolves.toEqual({ status: "error", code: "failed" });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("entro il limite: invia, e il limite per email usa l'indirizzo in minuscolo", async () => {
    checkRates.mockResolvedValue("allowed");
    await expect(sendEmailCode({ ...input, email: "Mario.Rossi@Example.com" })).resolves.toEqual({
      status: "sent",
      email: "Mario.Rossi@Example.com",
    });
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    const checks = checkRates.mock.calls[0]?.[0] as { identity: string }[];
    expect(checks.map((c) => c.identity)).toEqual(["198.51.100.9", "mario.rossi@example.com"]);
  });
});

describe("verifyEmailCode", () => {
  const input = { email: EMAIL, code: "123456", locale: "it" };

  it("contatore a limite: rate_limited e nessuna verifica del codice", async () => {
    checkRates.mockResolvedValue("limited");
    await expect(verifyEmailCode(input)).resolves.toEqual({ status: "error", code: "rate_limited" });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("contatore non disponibile: fail closed, nessuna verifica", async () => {
    checkRates.mockResolvedValue("unavailable");
    await expect(verifyEmailCode(input)).resolves.toEqual({ status: "error", code: "failed" });
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("startGuestSession", () => {
  const input = { locale: "it", captchaToken: "token" };

  it("contatore a limite: rate_limited e nessun ospite creato", async () => {
    checkRates.mockResolvedValue("limited");
    await expect(startGuestSession(input)).resolves.toEqual({ status: "error", code: "rate_limited" });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("contatore non disponibile: fail closed, nessun ospite creato", async () => {
    checkRates.mockResolvedValue("unavailable");
    await expect(startGuestSession(input)).resolves.toEqual({ status: "error", code: "failed" });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });
});

describe("sendGuestEmailCode e verifyGuestEmailCode", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ id: "guest-1", is_anonymous: true });
  });

  it("invio al limite: nessun updateUser", async () => {
    checkRates.mockResolvedValue("limited");
    await expect(sendGuestEmailCode({ email: EMAIL, locale: "it" })).resolves.toEqual({
      status: "error",
      code: "rate_limited",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("verifica al limite: nessun verifyOtp", async () => {
    checkRates.mockResolvedValue("limited");
    await expect(verifyGuestEmailCode({ email: EMAIL, code: "123456", locale: "it" })).resolves.toEqual({
      status: "error",
      code: "rate_limited",
    });
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
