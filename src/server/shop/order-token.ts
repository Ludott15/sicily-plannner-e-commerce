import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Token del link ospite (passo 7.3). Il token è casuale (32 byte, base64url) e sta solo nell'email; nel
// database entra il suo SHA-256 (hex). Ogni email al cliente ne genera uno nuovo, che sostituisce il
// precedente. Il confronto avviene a tempo costante.

const ACCESS_TOKEN_BYTES = 32;
const HASH_HEX_LENGTH = 64;
const EMPTY_HASH = "0".repeat(HASH_HEX_LENGTH);

export const accessTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export type NewAccessToken = { token: string; hash: string };

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newAccessToken(): NewAccessToken {
  const token = randomBytes(ACCESS_TOKEN_BYTES).toString("base64url");
  return { token, hash: hashAccessToken(token) };
}

// true se il token corrisponde all'hash salvato. Un hash assente (ordine di un account, o numero
// inesistente) non corrisponde mai. Il confronto dei byte non si interrompe al primo carattere diverso.
export function accessTokenMatches(storedHash: string | null, token: string): boolean {
  const candidate = Buffer.from(hashAccessToken(token), "hex");
  const stored = Buffer.from(storedHash ?? EMPTY_HASH, "hex");
  if (candidate.length !== HASH_HEX_LENGTH / 2 || stored.length !== candidate.length) return false;
  const same = timingSafeEqual(stored, candidate);
  return storedHash !== null && same;
}
