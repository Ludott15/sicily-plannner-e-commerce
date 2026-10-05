import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { activities, activityInterests, interests, places, preferenceWeights, profiles, userConstraints } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";
import { dbAsUser, type DbUser } from "@/server/db/user";
import { effectiveWeight, type CatalogActivity, type Pace, type Profile } from "./engine";

// Dati del motore di personalizzazione. Le risposte dell'onboarding sono dati personali:
// si leggono e si scrivono solo con dbAsUser (RLS: ognuno le proprie, ospite compreso).

export type Party = "solo" | "couple" | "family" | "friends";

export type OnboardingAnswers = {
  days: number;
  months: number[];
  // Interessi scelti, con il peso 0-5; quelli non scelti valgono 0.
  weights: Record<string, number>;
  pace: Pace;
  party: Party | null;
  budgetPerDayEur: number | null;
  hasCar: boolean;
};

export type SavedAnswers = OnboardingAnswers & { completed: boolean };

export const DEFAULT_ANSWERS: OnboardingAnswers = {
  days: 3,
  months: [],
  weights: {},
  pace: "balanced",
  party: null,
  budgetPerDayEur: null,
  hasCar: false,
};

// Risposte salvate, per riaprire l'onboarding ("Cambia preferenze") e per il motore.
// implicit si somma solo per il motore (Profile), non nelle risposte.
export async function getSavedAnswers(user: DbUser): Promise<(SavedAnswers & { implicit: Record<string, number> }) | null> {
  return dbAsUser(user, async (tx) => {
    const [profile] = await tx
      .select({ pace: profiles.pace, party: profiles.party, completedAt: profiles.onboardingCompletedAt })
      .from(profiles)
      .where(eq(profiles.id, user.id));
    const [constraints] = await tx.select().from(userConstraints).where(eq(userConstraints.userId, user.id));
    const weights = await tx
      .select({ key: preferenceWeights.interestKey, explicit: preferenceWeights.explicit, implicit: preferenceWeights.implicit })
      .from(preferenceWeights)
      .where(eq(preferenceWeights.userId, user.id));
    if (!profile) return null;
    return {
      completed: profile.completedAt !== null,
      days: constraints?.tripDays ?? DEFAULT_ANSWERS.days,
      months: constraints?.tripMonths ?? [],
      weights: Object.fromEntries(weights.filter((w) => w.explicit > 0).map((w) => [w.key, w.explicit])),
      implicit: Object.fromEntries(weights.map((w) => [w.key, w.implicit])),
      pace: profile.pace ?? DEFAULT_ANSWERS.pace,
      party: profile.party ?? null,
      budgetPerDayEur: constraints?.budgetPerDayEur ?? null,
      hasCar: constraints?.hasCar ?? false,
    };
  });
}

// Salva le risposte: vincoli e viaggio in user_constraints, ritmo e compagnia in profiles,
// pesi espliciti in preference_weights (quelli non scelti a 0; implicit non si tocca).
export async function saveAnswers(user: DbUser, answers: OnboardingAnswers): Promise<void> {
  // SQL esplicito: l'insert di Drizzle elenca anche le colonne con default (created_at,
  // implicit…), su cui authenticated non ha il grant di insert (grant minimi per colonna).
  // Interi già validati (1-12): letterale di array Postgres, perché il template sql di Drizzle
  // espande un array JS come lista di valori.
  const months = [...new Set(answers.months)].sort((a, b) => a - b);
  await dbAsUser(user, async (tx) => {
    const keys = (await tx.select({ key: interests.key }).from(interests)).map((r) => r.key);
    await tx.execute(sql`
      insert into public.user_constraints (user_id, budget_per_day_eur, has_car, trip_days, trip_months)
      values (${user.id}, ${answers.budgetPerDayEur}, ${answers.hasCar}, ${answers.days}, ${`{${months.join(",")}}`}::smallint[])
      on conflict (user_id) do update set
        budget_per_day_eur = excluded.budget_per_day_eur,
        has_car = excluded.has_car,
        trip_days = excluded.trip_days,
        trip_months = excluded.trip_months`);
    await tx
      .update(profiles)
      .set({ pace: answers.pace, party: answers.party, onboardingCompletedAt: new Date() })
      .where(eq(profiles.id, user.id));
    for (const key of keys) {
      await tx.execute(sql`
        insert into public.preference_weights (user_id, interest_key, explicit)
        values (${user.id}, ${key}, ${answers.weights[key] ?? 0})
        on conflict (user_id, interest_key) do update set explicit = excluded.explicit, updated_at = now()`);
    }
  });
}

export function toProfile(saved: SavedAnswers & { implicit: Record<string, number> }): Profile {
  const keys = new Set([...Object.keys(saved.weights), ...Object.keys(saved.implicit)]);
  return {
    weights: Object.fromEntries([...keys].map((k) => [k, effectiveWeight(saved.weights[k] ?? 0, saved.implicit[k] ?? 0)])),
    budgetPerDayEur: saved.budgetPerDayEur,
    hasCar: saved.hasCar,
    // Mobilità ridotta: non è tra le 6 domande; resta false finché non arriva in Preferenze.
    reducedMobility: false,
    pace: saved.pace,
    days: saved.days,
    months: saved.months,
  };
}

// Catalogo per il motore: solo attività attive (dbPublic), con tag e provincia del luogo.
export async function engineCatalog(): Promise<CatalogActivity[]> {
  return dbPublic(async (tx) => {
    const rows = await tx
      .select({
        id: activities.id,
        slug: activities.slug,
        title: activities.title,
        placeName: places.name,
        zone: places.province,
        durationMin: activities.durationMin,
        onSitePriceEur: activities.onSitePriceEur,
        seasonMonths: activities.seasonMonths,
        requiresCar: activities.requiresCar,
        accessible: activities.accessible,
        rating: activities.rating,
      })
      .from(activities)
      .innerJoin(places, eq(places.id, activities.placeId))
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
