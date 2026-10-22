// Nomi delle variabili d'ambiente che possono contenere l'ID di un partner (affiliate_partners.partner_id_env).
// Lista chiusa: solo questi nomi si leggono dall'ambiente e solo questi compaiono nel select del form admin.
// Non sta in server-only perché il form è un componente client.
// Un nome per ogni partner: il valore sta in .env.example (vuoto = link senza ID, funziona comunque).
export const PARTNER_ID_ENV_NAMES = [
  "BOOKING_AFFILIATE_ID",
  "DISCOVERCARS_AFFILIATE_ID",
  "GETYOURGUIDE_PARTNER_ID",
  "VIATOR_PARTNER_ID",
  "CIVITATIS_AGENCY_ID",
  "TRAVELPAYOUTS_MARKER",
  "HOSTELWORLD_AFFILIATE_ID",
  "PITCHUP_AFFILIATE_ID",
  "RENTALCARS_AFFILIATE_ID",
  "FERRYHOPPER_AFFILIATE_ID",
  "DIRECTFERRIES_AFFILIATE_ID",
  "OMIO_AFFILIATE_ID",
  "WELCOMEPICKUPS_AFFILIATE_ID",
  "TIQETS_AFFILIATE_ID",
  "CLICKANDBOAT_AFFILIATE_ID",
  "SAMBOAT_AFFILIATE_ID",
  "HEYMONDO_AFFILIATE_ID",
  "AIRALO_AFFILIATE_ID",
  "RADICALSTORAGE_AFFILIATE_ID",
] as const;

export type PartnerIdEnvName = (typeof PARTNER_ID_ENV_NAMES)[number];

export function isPartnerIdEnvName(value: string): value is PartnerIdEnvName {
  return (PARTNER_ID_ENV_NAMES as readonly string[]).includes(value);
}
