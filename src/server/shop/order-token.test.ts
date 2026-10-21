import { describe, expect, it } from "vitest";
import { accessTokenMatches, accessTokenSchema, hashAccessToken, newAccessToken } from "./order-token";

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

  it("corrisponde solo al token che ha generato l'hash", () => {
    const { token, hash } = newAccessToken();
    expect(accessTokenMatches(hash, token)).toBe(true);
    expect(accessTokenMatches(hash, `${token}x`)).toBe(false);
    expect(accessTokenMatches(hash, newAccessToken().token)).toBe(false);
  });

  it("nessun hash (account, numero inesistente) non corrisponde mai", () => {
    const { token } = newAccessToken();
    expect(accessTokenMatches(null, token)).toBe(false);
  });

  it("un hash malformato non corrisponde e non lancia", () => {
    const { token } = newAccessToken();
    expect(accessTokenMatches("abc", token)).toBe(false);
  });

  it("rifiuta un token di formato sbagliato", () => {
    expect(accessTokenSchema.safeParse("corto").success).toBe(false);
    expect(accessTokenSchema.safeParse("a".repeat(43) + "=").success).toBe(false);
    expect(accessTokenSchema.safeParse("a".repeat(44)).success).toBe(false);
  });
});
