import { z } from "zod";
import type { AreaReason, Profile, Reason } from "@/server/personalization/engine";

// Profilo di gruppo (passo 4.3). Pura: nessun accesso al database. Il tipo GroupPreferences è la
// forma JSON che restituisce la funzione SQL public.group_preferences: solo valori aggregati, mai
// le preferenze di un singolo membro. Il tipo Profile viene dal motore (solo tipi, nessun codice).

// Soglia di privacy (k): sotto questo numero di membri che hanno completato l'onboarding, la
// risposta è "private": nessun peso, nessuna mobilità ridotta, nessuna dieta. Stesso valore della
// funzione SQL public.group_preferences (supabase/migrations/20261015172033_preferenze_gruppo.sql).
export const GROUP_PRIVACY_MIN = 3;

export const groupPreferencesSchema = z.object({
  // Membri attuali del gruppo, e quelli che hanno completato l'onboarding (gusti usati nei pesi).
  members: z.number().int().min(0),
  withPreferences: z.number().int().min(0),
  // True se withPreferences < GROUP_PRIVACY_MIN: in quel caso weights è {}, reducedMobility false e diets [].
  private: z.boolean(),
  // Pesi per interesse (media dei membri, minimo 2 se almeno uno ha dato 5); solo pesi positivi.
  weights: z.record(z.string(), z.number().min(0).max(5)),
  constraints: z.object({
    // Il più restrittivo tra chi ha risposto (none, poi rental, poi own); null se nessuno ha risposto.
    car: z.enum(["none", "own", "rental"]).nullable(),
    // Vera se almeno un membro la indica; sempre false se private.
    reducedMobility: z.boolean(),
    // Unione delle diete di tutti i membri, in ordine alfabetico; vuota se private.
    diets: z.array(z.string()),
    // Il minimo dei budget indicati; null se nessuno ne ha indicato uno.
    budgetPerDayEur: z.number().int().min(0).nullable(),
    // Il più lento tra chi ha completato l'onboarding (balanced se nessuno).
    pace: z.enum(["relaxed", "balanced", "intense"]),
  }),
});

export type GroupPreferences = z.infer<typeof groupPreferencesSchema>;

// Valida la risposta della funzione SQL. Un formato diverso è un errore di sistema, non di dominio.
export function parseGroupPreferences(value: unknown): GroupPreferences {
  const parsed = groupPreferencesSchema.safeParse(value);
  if (!parsed.success) throw new Error("group_preferences_invalid");
  return parsed.data;
}

// Profilo del motore per il gruppo: i pesi e i vincoli aggregati, i giorni e i mesi del viaggio del
// gruppo. Nessun aeroporto: il gruppo non ha un aeroporto di arrivo unico.
export function groupProfileFrom(aggregate: GroupPreferences, days: number, months: readonly number[]): Profile {
  return {
    weights: { ...aggregate.weights },
    budgetPerDayEur: aggregate.constraints.budgetPerDayEur,
    car: aggregate.constraints.car,
    reducedMobility: aggregate.constraints.reducedMobility,
    diet: [...aggregate.constraints.diets],
    pace: aggregate.constraints.pace,
    days,
    months: [...months],
    airport: null,
  };
}

// Livelli degli interessi comuni: high da 4, medium da 2,5 (sotto non compaiono).
export const COMMON_INTEREST = { high: 4, medium: 2.5 } as const;

export type CommonInterestLevel = "high" | "medium";

// Interessi comuni del gruppo: solo chiave e livello aggregato, mai per persona. Ordine per peso,
// poi per chiave; al massimo `limit`.
export function commonInterests(aggregate: GroupPreferences, limit = 4): { key: string; level: CommonInterestLevel }[] {
  if (aggregate.private) return [];
  return Object.entries(aggregate.weights)
    .filter(([, weight]) => weight >= COMMON_INTEREST.medium)
    .sort(([keyA, weightA], [keyB, weightB]) => weightB - weightA || keyA.localeCompare(keyB))
    .slice(0, Math.max(0, limit))
    .map(([key, weight]) => {
      const level: CommonInterestLevel = weight >= COMMON_INTEREST.high ? "high" : "medium";
      return { key, level };
    });
}

// Modo dei motivi: "group" con tre o più membri (i motivi d'interesse sono "Per il gruppo");
// "logistic" con meno di tre (solo motivi pratici, per non svelare i gusti di nessuno).
export type ReasonsMode = "group" | "logistic";

// Motivi pratici: durata, tappe nello stesso posto, auto, aeroporto, tappe, due zone; la riserva.
const LOGISTIC_CODES: ReadonlySet<Reason["code"] | AreaReason["code"]> = new Set<Reason["code"] | AreaReason["code"]>([
  "shortVisit",
  "samePlace",
  "bestInZone",
  "noCar",
  "nearAirport",
  "stops",
  "twoAreas",
]);

// Con "group" tutti i motivi; con "logistic" solo quelli pratici.
export function filterReasons(reasons: readonly Reason[], mode: ReasonsMode): Reason[];
export function filterReasons(reasons: readonly AreaReason[], mode: ReasonsMode): AreaReason[];
export function filterReasons(reasons: readonly (Reason | AreaReason)[], mode: ReasonsMode): (Reason | AreaReason)[] {
  return mode === "group" ? [...reasons] : reasons.filter((reason) => LOGISTIC_CODES.has(reason.code));
}
