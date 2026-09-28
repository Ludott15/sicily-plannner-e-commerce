import { randomBytes } from "node:crypto";

// Link in uscita verso i partner affiliati (docs/spec.md, "Route di uscita /api/go/[id]").
// Il subid si aggiunge nel parametro previsto da ciascun partner. I nomi dei parametri
// sono da confermare con i termini di ogni programma prima della milestone 6.

export type Partner = "travelpayouts" | "getyourguide" | "viator" | "car_rental" | "internal";

const SUBID_PARAM: Record<Partner, string | null> = {
  getyourguide: "cmp",
  viator: "campaign",
  travelpayouts: "sub_id",
  car_rental: "subid",
  internal: null,
};

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

// URL finale: l'affiliate_url del catalogo seguito dal parametro del subid. Si aggiunge
// in coda senza riscrivere l'URL di base, così l'URL finale inizia sempre con quello del
// catalogo (lo verifica record_affiliate_click). Con un frammento (#) non si aggiunge nulla.
export function buildAffiliateUrl(baseUrl: string, partner: Partner, subid: string): string {
  const param = SUBID_PARAM[partner];
  if (!param || baseUrl.includes("#")) return baseUrl;
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${param}=${subid}`;
}
