import { z } from "zod";
import { PROVINCES } from "@/lib/provinces";

// Badge (passo 5.2): criteri, validazione e descrizione leggibile. Non sta in server-only perché il
// form admin e la pagina /punti lo usano nei componenti client. Specchio del check SQL
// badge_criteria_valid in supabase/migrations/20261015181328_badge.sql: cambiare un valore vuol dire cambiarlo in entrambi.

// Chiave del badge: slug minuscolo, 3-40 caratteri.
export const BADGE_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const BADGE_INTEREST_PATTERN = /^[a-z][a-z_]*$/;

// Province ammesse: le sigle di PROVINCES (src/lib/provinces.ts).
export function isBadgeProvince(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROVINCES, value);
}

const threshold = z.number().int().min(1).max(999999);

export const badgeCriteriaSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("itineraries_completed"), min: threshold }),
  z.strictObject({
    type: z.literal("check_ins_in_province"),
    province: z.string().refine(isBadgeProvince, "unknown_province"),
    min: threshold,
  }),
  z.strictObject({ type: z.literal("provinces_checked_in"), min: z.number().int().min(1).max(9) }),
  z.strictObject({
    type: z.literal("interest_activities_completed"),
    interest: z.string().regex(BADGE_INTEREST_PATTERN).max(40),
    min: threshold,
  }),
  z.strictObject({ type: z.literal("group_size"), min: z.number().int().min(2).max(30) }),
  z.strictObject({ type: z.literal("points_total"), min: threshold }),
]);

export type BadgeCriteria = z.infer<typeof badgeCriteriaSchema>;
export type BadgeCriteriaType = BadgeCriteria["type"];

export const badgeKeySchema = z
  .string()
  .min(3)
  .max(40)
  .regex(BADGE_KEY_PATTERN);

// Descrizione per la UI: una chiave di traduzione e i valori da inserire. Le stringhe sono in messages/*.json.
export type CriteriaDescription = {
  key: string;
  values: Record<string, string | number>;
};

export function describeCriteria(criteria: BadgeCriteria): CriteriaDescription {
  switch (criteria.type) {
    case "itineraries_completed":
      return { key: "itineraries_completed", values: { min: criteria.min } };
    case "check_ins_in_province":
      return {
        key: "check_ins_in_province",
        values: { province: criteria.province, min: criteria.min },
      };
    case "provinces_checked_in":
      return { key: "provinces_checked_in", values: { min: criteria.min } };
    case "interest_activities_completed":
      return {
        key: "interest_activities_completed",
        values: { interest: criteria.interest, min: criteria.min },
      };
    case "group_size":
      return { key: "group_size", values: { min: criteria.min } };
    case "points_total":
      return { key: "points_total", values: { min: criteria.min } };
  }
}

// Badge iniziali (dati di prodotto, specchio della migrazione supabase/migrations/20261015181328_badge.sql). Una sola
// descrizione: la colonna badges.description è in italiano.
export const INITIAL_BADGES: readonly {
  key: string;
  nameIt: string;
  nameEn: string;
  description: string;
  criteria: BadgeCriteria;
}[] = [
  {
    key: "primo-viaggio",
    nameIt: "Primo viaggio",
    nameEn: "First trip",
    description: "Completa il tuo primo itinerario: tre luoghi visitati con il check-in.",
    criteria: { type: "itineraries_completed", min: 1 },
  },
  {
    key: "esploratore-etna",
    nameIt: "Esploratore dell'Etna",
    nameEn: "Etna explorer",
    description: "Fai cinque check-in in luoghi della provincia di Catania.",
    criteria: { type: "check_ins_in_province", province: "CT", min: 5 },
  },
  {
    key: "nove-su-nove",
    nameIt: "Nove su nove",
    nameEn: "Nine out of nine",
    description: "Fai almeno un check-in in ciascuna delle nove province siciliane.",
    criteria: { type: "provinces_checked_in", min: 9 },
  },
  {
    key: "buongustaio",
    nameIt: "Buongustaio",
    nameEn: "Food lover",
    description: "Completa cinque attività con interesse cibo e vino.",
    criteria: { type: "interest_activities_completed", interest: "food_wine", min: 5 },
  },
  {
    key: "organizzatore",
    nameIt: "Organizzatore",
    nameEn: "Organiser",
    description: "Crea un gruppo con almeno quattro membri.",
    criteria: { type: "group_size", min: 4 },
  },
];
