import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dbAdmin } from "@/server/db/admin";
import { rateLimitHits } from "@/server/db/schema";
import { AUTH_RULES, rateBucket } from "@/server/security/rate-limit";

// Prova a rovescio del limite di invio del codice su Postgres locale (passo 11.5, revisione B1). Il
// contatore è quello vero (hit_rate_limit tramite dbRateLimiter); Supabase Auth è sostituito da un finto
// che accetta l'invio, così il test non dipende dalla rete né dal CAPTCHA. Un IP e un'email di prova,
// con prefisso int-, e le righe dei contatori si tolgono alla fine.

const state = vi.hoisted(() => ({ ip: "203.0.113.1" }));
const fakeAuth = vi.hoisted(() => ({ signInWithOtp: vi.fn(async () => ({ error: null })) }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": state.ip }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/env", () => ({ publicEnv: { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" } }));
vi.mock("@/server/auth", () => ({ getUser: async () => null, requireUser: vi.fn() }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ auth: fakeAuth }) }));

import { sendEmailCode } from "./actions";

const SECRET = "int-auth-rate-limit-secret-not-a-secret";
const stamp = Date.now();
const email = `int-rl-${stamp}@example.com`;
const ip = `203.0.113.${(stamp % 200) + 20}`;
const buckets: string[] = [];

beforeAll(() => {
  vi.stubEnv("RATE_LIMIT_SECRET", SECRET);
  state.ip = ip;
  buckets.push(
    rateBucket(AUTH_RULES.sendCodeEmail.scope, email.toLowerCase(), SECRET),
    rateBucket(AUTH_RULES.sendCodeIp.scope, ip, SECRET),
  );
});

afterAll(async () => {
  await dbAdmin.delete(rateLimitHits).where(inArray(rateLimitHits.bucket, buckets));
  vi.unstubAllEnvs();
});

describe("sendEmailCode con il contatore reale", () => {
  it("sei invii alla stessa email: i primi cinque passano, il sesto è rate_limited e non arriva a Supabase", async () => {
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await sendEmailCode({ email, locale: "it", captchaToken: "token" }));
    }

    for (const result of results.slice(0, 5)) {
      expect(result).toEqual({ status: "sent", email });
    }
    expect(results[5]).toEqual({ status: "error", code: "rate_limited" });
    expect(fakeAuth.signInWithOtp).toHaveBeenCalledTimes(5);
  });
});
