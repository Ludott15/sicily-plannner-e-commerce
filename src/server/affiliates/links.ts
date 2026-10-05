import { randomBytes } from "node:crypto";

// Link in uscita verso i partner affiliati (docs/spec.md, "Route di uscita /api/go/[id]").
// L'URL finale con il parametro del subid lo costruisce record_affiliate_click in SQL
// (affiliate_subid_param): affiliate_url non è leggibile dal client.

export type Partner = "travelpayouts" | "getyourguide" | "viator" | "car_rental" | "internal";

// Nome del partner mostrato nell'offerta e nella riga di trasparenza.
// null: nessun partner da nominare, quindi nessuna offerta affiliata.
const PARTNER_NAME: Record<Partner, string | null> = {
  getyourguide: "GetYourGuide",
  viator: "Viator",
  travelpayouts: "Aviasales",
  car_rental: null,
  internal: null,
};

export function partnerName(partner: Partner): string | null {
  return PARTNER_NAME[partner];
}

const SUBID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

// 16 caratteri [a-z0-9]: breve, univoco in pratica, accettato da tutti i partner.
export function newSubid(): string {
  const bytes = randomBytes(16);
  let out = "";
  for (const b of bytes) out += SUBID_ALPHABET[b % SUBID_ALPHABET.length];
  return out;
}
