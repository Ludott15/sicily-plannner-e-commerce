import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Il modulo importa il database: nei test unitari il client non serve (il contatore è iniettato).
vi.mock("@/server/db/public", () => ({ dbPublic: vi.fn() }));

import { AUTH_RULES, checkRate, checkRates, ipIdentity, rateBucket, type RateCounter } from "./rate-limit";

const SECRET = "unit-test-secret";
const rule = { scope: "auth:verify:ip", limit: 3, windowSeconds: 60 } as const;

describe("rateBucket", () => {
  it("è deterministico, ha il formato di hit_rate_limit e non contiene l'identità in chiaro", () => {
    const bucket = rateBucket("auth:send:email", "mario@example.com", SECRET);
    expect(bucket).toBe(rateBucket("auth:send:email", "mario@example.com", SECRET));
    expect(bucket).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(bucket).not.toContain("mario");
  });

  it("separa gli scopi e le chiavi: lo stesso identificativo non condivide il contatore", () => {
    const a = rateBucket("auth:send:ip", "1.2.3.4", SECRET);
    expect(a).not.toBe(rateBucket("auth:verify:ip", "1.2.3.4", SECRET));
    expect(a).not.toBe(rateBucket("auth:send:ip", "1.2.3.4", "altra-chiave"));
  });
});

describe("checkRate", () => {
  let counter: RateCounter;
  beforeEach(() => {
    counter = vi.fn<RateCounter>(async () => true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("consente se il contatore risponde sotto il limite, e passa scopo, limite e finestra", async () => {
    await expect(checkRate(rule, "1.2.3.4", { counter, secret: SECRET })).resolves.toBe("allowed");
    expect(counter).toHaveBeenCalledWith(rateBucket(rule.scope, "1.2.3.4", SECRET), 3, 60);
  });

  it("nega con limited quando il contatore dice che il limite è raggiunto", async () => {
    counter = vi.fn<RateCounter>(async () => false);
    await expect(checkRate(rule, "1.2.3.4", { counter, secret: SECRET })).resolves.toBe("limited");
  });

  it("fail closed: se il contatore fallisce o risponde in modo non valido, è unavailable", async () => {
    counter = vi.fn<RateCounter>(async () => {
      throw new Error("db down");
    });
    await expect(checkRate(rule, "1.2.3.4", { counter, secret: SECRET })).resolves.toBe("unavailable");
  });

  it("senza chiave: in sviluppo consente, in produzione è unavailable (la richiesta non è verificabile)", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    await expect(checkRate(rule, "1.2.3.4", { counter, secret: undefined })).resolves.toBe("allowed");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(checkRate(rule, "1.2.3.4", { counter, secret: undefined })).resolves.toBe("unavailable");
    expect(counter).not.toHaveBeenCalled();
  });
});

describe("checkRates", () => {
  it("vale il peggiore: un limite raggiunto nega anche se gli altri passano", async () => {
    const counter = vi.fn<RateCounter>(async () => true);
    const byIp = { rule: AUTH_RULES.sendCodeIp, identity: "ip" };
    const byEmail = { rule: AUTH_RULES.sendCodeEmail, identity: "mail" };
    const decision = await checkRates([byIp, byEmail], { counter, secret: SECRET });
    expect(decision).toBe("allowed");
    const limitedCounter = vi.fn<RateCounter>(async (_bucket, limit) => limit !== AUTH_RULES.sendCodeEmail.limit);
    await expect(checkRates([byIp, byEmail], { counter: limitedCounter, secret: SECRET })).resolves.toBe("limited");
  });

  it("unavailable se un contatore non risponde e nessuno nega", async () => {
    const counter = vi.fn<RateCounter>(async (_bucket, limit) => {
      if (limit === AUTH_RULES.guestIp.limit) throw new Error("boom");
      return true;
    });
    await expect(
      checkRates([{ rule: AUTH_RULES.guestIp, identity: "ip" }, { rule: AUTH_RULES.verifyIp, identity: "ip" }], {
        counter,
        secret: SECRET,
      }),
    ).resolves.toBe("unavailable");
  });
});

describe("ipIdentity", () => {
  it("usa il primo IP di x-forwarded-for, poi x-real-ip; senza IP il limite per IP non si applica", () => {
    expect(ipIdentity(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(ipIdentity(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(ipIdentity(new Headers())).toBeNull();
  });
});

describe("regole", () => {
  it("hanno limiti positivi, finestre positive e scopi unici", () => {
    const rules = Object.values(AUTH_RULES);
    for (const r of rules) {
      expect(r.limit).toBeGreaterThan(0);
      expect(r.windowSeconds).toBeGreaterThan(0);
    }
    expect(new Set(rules.map((r) => r.scope)).size).toBe(rules.length);
  });
});
