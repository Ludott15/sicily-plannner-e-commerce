import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Firma HMAC-SHA256 dei link di uscita (passo 3.1). Generalizza la firma dei voli
// (src/server/flights/links.ts): il server firma una stringa canonica di campi separati da "|"
// e la route ricalcola la firma prima di costruire l'URL del fornitore. Un link alterato o
// scaduto non esce. Ogni campo non può contenere "|" né caratteri di controllo, così due link
// diversi non producono mai la stessa stringa. Mai firma con chiave vuota.

export type SignedLinkCheck = "ok" | "missing_secret" | "invalid_signature" | "expired";

// Stringa canonica: i campi uniti da "|". Un campo assente è la stringa vuota.
export function canonicalFields(fields: readonly string[]): string {
  for (const field of fields) {
    if (field.includes("|") || /[\u0000-\u001f\u007f]/.test(field)) {
      throw new Error("signed_link: invalid_field");
    }
  }
  return fields.join("|");
}

// Lancia se la chiave manca: non si firma mai con un segreto vuoto.
export function signFields(fields: readonly string[], secret: string | undefined): string {
  if (!secret) throw new Error("signed_link: missing_secret");
  return createHmac("sha256", secret).update(canonicalFields(fields)).digest("base64url");
}

// Controlla prima la firma (a tempo costante), poi la scadenza: un exp alterato dopo la firma
// dà invalid_signature, non expired. expiresAt in secondi Unix.
export function verifyFields(
  fields: readonly string[],
  signature: string,
  secret: string | undefined,
  expiresAt: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SignedLinkCheck {
  if (!secret) return "missing_secret";
  let expected: Buffer;
  try {
    expected = createHmac("sha256", secret).update(canonicalFields(fields)).digest();
  } catch {
    return "invalid_signature";
  }
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return "invalid_signature";
  if (expiresAt <= nowSeconds) return "expired";
  return "ok";
}
