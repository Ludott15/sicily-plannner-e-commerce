import { describe, expect, it } from "vitest";
import { clientIp, rateLimitBucket } from "./rate-key";

const SECRET = "test-secret-do-not-use-in-prod";

describe("clientIp", () => {
  it("preferisce x-real-ip, poi il primo IP di x-forwarded-for, altrimenti null", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "203.0.113.7" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "  " }))).toBeNull();
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("rateLimitBucket", () => {
  it("rispetta il formato di hit_rate_limit e non contiene l'identità in chiaro", () => {
    const bucket = rateLimitBucket("ip", "203.0.113.7", SECRET);
    expect(bucket).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(bucket).not.toContain("203.0.113.7");
  });

  it("separa IP e utente, e cambia con la chiave", () => {
    const ip = rateLimitBucket("ip", "same", SECRET);
    const user = rateLimitBucket("user", "same", SECRET);
    expect(ip).not.toBe(user);
    expect(rateLimitBucket("ip", "203.0.113.7", SECRET)).not.toBe(rateLimitBucket("ip", "203.0.113.8", SECRET));
    expect(rateLimitBucket("ip", "203.0.113.7", SECRET)).not.toBe(rateLimitBucket("ip", "203.0.113.7", "altra-chiave"));
  });
});
