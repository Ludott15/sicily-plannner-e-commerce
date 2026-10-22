import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

// Token del link ospite (passo 7.3). Il token è casuale (32 byte, base64url) e sta solo nell'email; nel
// database entra il suo SHA-256 (hex). Ogni email al cliente ne genera uno nuovo, che sostituisce il
// precedente. La verifica del token avviene nel database (order_guest_detail): il server non legge l'hash.

const ACCESS_TOKEN_BYTES = 32;

export const accessTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export type NewAccessToken = { token: string; hash: string };

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newAccessToken(): NewAccessToken {
  const token = randomBytes(ACCESS_TOKEN_BYTES).toString("base64url");
  return { token, hash: hashAccessToken(token) };
}
