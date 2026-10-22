import { describe, expect, it } from "vitest";
import { accessTokenSchema, hashAccessToken, newAccessToken } from "./order-token";

describe("token del link ospite", () => {
  it("token di 43 caratteri base64url e hash SHA-256 esadecimale", () => {
    const { token, hash } = newAccessToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashAccessToken(token));
    expect(accessTokenSchema.safeParse(token).success).toBe(true);
  });

  it("due token non coincidono", () => {
    expect(newAccessToken().token).not.toBe(newAccessToken().token);
  });

  it("rifiuta un token di formato sbagliato", () => {
    expect(accessTokenSchema.safeParse("corto").success).toBe(false);
    expect(accessTokenSchema.safeParse("a".repeat(43) + "=").success).toBe(false);
    expect(accessTokenSchema.safeParse("a".repeat(44)).success).toBe(false);
  });

  it("l'hash non è un token valido: non passa il controllo di forma", () => {
    // Il link porta il token, non il suo hash: un hash di 64 caratteri non supera la forma del token.
    expect(accessTokenSchema.safeParse(hashAccessToken("x")).success).toBe(false);
  });
});
