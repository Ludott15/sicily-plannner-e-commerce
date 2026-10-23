import { describe, expect, it } from "vitest";
import {
  CHECKOUT_IP_LIMIT,
  CHECKOUT_USER_LIMIT,
  checkoutBucket,
  checkoutLimitChecks,
} from "./checkout-limit-config";

const SECRET = "int-checkout-limit-secret";
const USER = "55555555-5555-4555-8555-555555555555";

describe("limiti del checkout", () => {
  it("10 al giorno per utente e 30 all'ora per IP", () => {
    expect(CHECKOUT_USER_LIMIT).toEqual({ limit: 10, windowSeconds: 86400 });
    expect(CHECKOUT_IP_LIMIT).toEqual({ limit: 30, windowSeconds: 3600 });
  });

  it("con utente: due controlli, utente e IP; senza utente solo l'IP", () => {
    const withUser = checkoutLimitChecks({ userId: USER, ip: "203.0.113.7", secret: SECRET });
    expect(withUser.map((check) => [check.limit, check.windowSeconds])).toEqual([
      [10, 86400],
      [30, 3600],
    ]);
    const anonymous = checkoutLimitChecks({ userId: null, ip: "203.0.113.7", secret: SECRET });
    expect(anonymous).toHaveLength(1);
    expect(anonymous[0]?.limit).toBe(30);
  });

  it("i bucket sono HMAC: stabili, senza id né IP in chiaro, distinti per scopo e per identità", () => {
    const bucket = checkoutBucket("user", USER, SECRET);
    expect(bucket).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(bucket).not.toContain(USER);
    expect(checkoutBucket("user", USER, SECRET)).toBe(bucket);
    expect(checkoutBucket("ip", USER, SECRET)).not.toBe(bucket);
    expect(checkoutBucket("user", USER, "altra-chiave")).not.toBe(bucket);
  });

  it("IP mancante: bucket comune agli sconosciuti, non un bucket vuoto", () => {
    const [check] = checkoutLimitChecks({ userId: null, ip: null, secret: SECRET });
    expect(check?.bucket).toBe(checkoutBucket("ip", "unknown", SECRET));
  });
});
