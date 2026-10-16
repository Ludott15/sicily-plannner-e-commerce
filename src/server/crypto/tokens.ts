import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Token dei link (itinerari pubblici e inviti ai gruppi). Il token in chiaro esiste solo nel link
// che si mostra una volta: il database conserva solo l'hash SHA-256 (hex). Lo stesso hash lo calcola
// public.accept_invite, public.invite_link_status e public.shared_itinerary (su UTF-8).

// 32 byte casuali in base64url (43 caratteri).
export function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

// Hash SHA-256 in hex del token.
export function shareTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
