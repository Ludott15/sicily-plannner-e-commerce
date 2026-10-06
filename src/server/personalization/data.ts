import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { activities, activityInterests, areas, interests, places, preferenceWeights, profiles, userConstraints } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { effectiveWeight, type Airport, type CarAccess, type CatalogActivity, type Pace, type Profile } from "./engine";
import { NEUTRAL } from "@/lib/onboarding";

// Dati del motore di personalizzazione. Le risposte dell'onboarding e le preferenze sono dati
// personali: si leggono e si scrivono solo con dbAsUser (RLS: ognuno le proprie, ospite
// compreso). Mobilità ridotta e dieta sono dati sensibili: solo con consenso esplicito.

export type Party = "solo" | "couple" | "family" | "friends";

// Risposte dell'onboarding (7 domande). null = domanda saltata: vale il valore neutro di
// answers.ts (documentato in docs/spec.md).
export type OnboardingAnswers = {
  days: number | null;
  months: number[];
  // Interessi scelti e il loro peso 0-5 (uno scelto può valere 0: "Non conta").
  interests: string[];
  weights: Record<string, number>;
  pace: Pace | null;
  party: Party | null;
  airport: Airport | null;
  budgetPerDayEur: number | null;
  car: CarAccess | null;
};

// Preferenze in più, solo nella pagina Preferenze.
export type ExtraPreferences = {
  reducedMobility: boolean;
  diet: string[];
  heatTolerance: number | null;
  crowdTolerance: number | null;
  // Consenso esplicito a salvare mobilità ridotta e dieta.
  sensitiveConsent: boolean;
};

export type SavedPreferences = OnboardingAnswers &
  ExtraPreferences & { completed: boolean; implicit: Record<string, number> };

export const EMPTY_ANSWERS: OnboardingAnswers = {
  days: null,
  months: [],
  interests: [],
  weights: {},
  pace: null,
  party: null,
  airport: null,
  budgetPerDayEur: null,
  car: null,
};

export async function getSavedPreferences(user: DbUser): Promise<SavedPreferences | null> {
  return dbAsUser(user, async (tx) => {
    const [profile] = await tx
      .select({ pace: profiles.pace, party: profiles.party, completedAt: profiles.onboardingCompletedAt })
      .from(profiles)
      .where(eq(profiles.id, user.id));
    const [c] = await tx.select().from(userConstraints).where(eq(userConstraints.userId, user.id));
    const weights = await tx
      .select({ key: preferenceWeights.interestKey, explicit: preferenceWeights.explicit, implicit: preferenceWeights.implicit })
      .from(preferenceWeights)
      .where(eq(preferenceWeights.userId, user.id));
    if (!profile) return null;
    const chosen = weights.filter((w) => w.explicit > 0);
    return {
      completed: profile.completedAt !== null,
      days: c?.tripDays ?? null,
      months: c?.tripMonths ?? [],
      interests: chosen.map((w) => w.key).sort(),
      weights: Object.fromEntries(chosen.map((w) => [w.key, w.explicit])),
      implicit: Object.fromEntries(weights.map((w) => [w.key, w.implicit])),
      pace: profile.pace ?? null,
      party: profile.party ?? null,
      airport: (c?.arrivalAirport as Airport | null) ?? null,
      budgetPerDayEur: c?.budgetPerDayEur ?? null,
      car: c?.carAccess ?? null,
      reducedMobility: c?.reducedMobility ?? false,
      diet: c?.diet ?? [],
      heatTolerance: c?.heatTolerance ?? null,
      crowdTolerance: c?.crowdTolerance ?? null,
      sensitiveConsent: c?.sensitiveConsentAt != null,
    };
  });
}

// Letterale di array Postgres per interi già validati: il template sql di Drizzle espande un
// array JS come lista di valori.
const intArray = (values: number[]) => `{${[...new Set(values)].sort((a, b) => a - b).join(",")}}`;
const textArray = (values: string[]) => `{${[...new Set(values)].sort().join(",")}}`;

// Salva le risposte dell'onboarding: vincoli e viaggio in user_constraints, ritmo e compagnia
// in profiles, pesi espliciti in preference_weights (scelti con il loro peso, gli altri a 0;
// implicit non si tocca). SQL esplicito: l'insert di Drizzle elenca anche le colonne con
// default, su cui authenticated non ha il grant (grant minimi per colonna).
export async function saveAnswers(user: DbUser, answers: OnboardingAnswers): Promise<void> {
  await dbAsUser(user, async (tx) => {
    const keys = (await tx.select({ key: interests.key }).from(interests)).map((r) => r.key);
    await tx.execute(sql`
      insert into public.user_constraints (user_id, budget_per_day_eur, car_access, trip_days, trip_months, arrival_airport)
      values (${user.id}, ${answers.budgetPerDayEur}, ${answers.car}, ${answers.days}, ${intArray(answers.months)}::smallint[], ${answers.airport})
      on conflict (user_id) do update set
        budget_per_day_eur = excluded.budget_per_day_eur,
        car_access = excluded.car_access,
        trip_days = excluded.trip_days,
        trip_months = excluded.trip_months,
        arrival_airport = excluded.arrival_airport`);
    await tx
      .update(profiles)
      .set({ pace: answers.pace, party: answers.party, onboardingCompletedAt: new Date() })
      .where(eq(profiles.id, user.id));
    const chosen = new Set(answers.interests);
    for (const key of keys) {
      const explicit = chosen.has(key) ? (answers.weights[key] ?? NEUTRAL.weight) : 0;
      await tx.execute(sql`
        insert into public.preference_weights (user_id, interest_key, explicit)
        values (${user.id}, ${key}, ${explicit})
        on conflict (user_id, interest_key) do update set explicit = excluded.explicit, updated_at = now()`);
    }
  });
}

// Preferenze in più. Mobilità ridotta e dieta si salvano solo con il consenso; senza consenso
// (o con "Cancella") restano vuote e il consenso si toglie: il vincolo del database lo impone.
export async function saveExtraPreferences(user: DbUser, extra: ExtraPreferences): Promise<void> {
  const consent = extra.sensitiveConsent;
  const reducedMobility = consent ? extra.reducedMobility : false;
  const diet = consent ? extra.diet : [];
  const keepConsent = consent && (reducedMobility || diet.length > 0);
  await dbAsUser(user, (tx) =>
    tx.execute(sql`
      insert into public.user_constraints (user_id, reduced_mobility, diet, sensitive_consent_at, heat_tolerance, crowd_tolerance)
      values (${user.id}, ${reducedMobility}, ${textArray(diet)}::text[], ${keepConsent ? sql`now()` : null}, ${extra.heatTolerance}, ${extra.crowdTolerance})
      on conflict (user_id) do update set
        reduced_mobility = excluded.reduced_mobility,
        diet = excluded.diet,
        sensitive_consent_at = case when excluded.sensitive_consent_at is null then null
          else coalesce(public.user_constraints.sensitive_consent_at, excluded.sensitive_consent_at) end,
        heat_tolerance = excluded.heat_tolerance,
        crowd_tolerance = excluded.crowd_tolerance`),
  );
}

// "Cancella questi dati": mobilità ridotta, dieta e consenso tornano vuoti; il resto resta.
export async function clearSensitivePreferences(user: DbUser): Promise<void> {
  await dbAsUser(user, (tx) =>
    tx.execute(sql`
      update public.user_constraints
      set reduced_mobility = false, diet = '{}', sensitive_consent_at = null
      where user_id = ${user.id}`),
  );
}

// Profilo per il motore: valori neutri per le domande saltate.
export function toProfile(saved: SavedPreferences): Profile {
  const keys = new Set([...Object.keys(saved.weights), ...Object.keys(saved.implicit)]);
  return {
    weights: Object.fromEntries([...keys].map((k) => [k, effectiveWeight(saved.weights[k] ?? 0, saved.implicit[k] ?? 0)])),
    budgetPerDayEur: saved.budgetPerDayEur,
    car: saved.car,
    reducedMobility: saved.reducedMobility,
    diet: saved.diet,
    pace: saved.pace ?? NEUTRAL.pace,
    days: saved.days ?? NEUTRAL.days,
    months: saved.months,
    airport: saved.airport,
  };
}

// Catalogo per il motore: solo attività attive (dbPublic), con tag, area e coordinate del luogo.
// Le attività di un luogo senza area non entrano nelle proposte.
export async function engineCatalog(): Promise<CatalogActivity[]> {
  return dbPublic(async (tx) => {
    const rows = await tx
      .select({
        id: activities.id,
        slug: activities.slug,
        title: activities.title,
        placeName: places.name,
        area: areas.slug,
        lat: places.lat,
        lng: places.lng,
        durationMin: activities.durationMin,
        onSitePriceEur: activities.onSitePriceEur,
        seasonMonths: activities.seasonMonths,
        requiresCar: activities.requiresCar,
        accessible: activities.accessible,
        dietFriendly: activities.dietFriendly,
        rating: activities.rating,
      })
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
      .innerJoin(areas, eq(areas.id, places.areaId))
      .orderBy(asc(activities.id));
    const ids = rows.map((r) => r.id);
    const tags = ids.length
      ? await tx
          .select({ activityId: activityInterests.activityId, key: activityInterests.interestKey, strength: activityInterests.strength })
          .from(activityInterests)
          .where(inArray(activityInterests.activityId, ids))
      : [];
    return rows.map((r) => ({
      ...r,
      onSitePriceEur: r.onSitePriceEur === null ? null : Number(r.onSitePriceEur),
      rating: r.rating === null ? null : Number(r.rating),
      tags: tags.filter((t) => t.activityId === r.id).map((t) => ({ key: t.key, strength: t.strength })),
    }));
  });
}

// Nomi delle aree nella lingua della pagina, per slug.
export async function areaNames(locale: string): Promise<Map<string, string>> {
  const rows = await dbPublic((tx) =>
    tx.select({ slug: areas.slug, it: areas.nameIt, en: areas.nameEn }).from(areas).orderBy(asc(areas.sort)),
  );
  return new Map(rows.map((r) => [r.slug, locale === "en" ? r.en : r.it]));
}
