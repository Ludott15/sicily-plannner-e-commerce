"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SICILY_AIRPORT_CODES } from "@/lib/flights/airports";
import { routing } from "@/lib/i18n/routing";
import { getUser, requireUser } from "@/server/auth";
import { createClient } from "@/server/supabase/server";
import { clearSensitivePreferences, getSavedPreferences, saveAnswers, saveExtraPreferences, saveTastes, saveTrip } from "./data";

// Onboarding e Preferenze (M4): Zod → utente (o nuova sessione ospite, protetta da Turnstile)
// → scrittura con dbAsUser. Sono dati personali: restano dell'utente, e nella conversione da
// ospite ad account restano suoi (stesso user id).

const DIETS = ["vegetarian", "vegan", "gluten_free", "lactose_free"] as const;
const interestKey = z.string().regex(/^[a-z_]{1,40}$/);

const tasteShape = {
  interests: z.array(interestKey).max(30),
  weights: z.record(interestKey, z.number().int().min(0).max(5)),
  pace: z.enum(["relaxed", "balanced", "intense"]).nullable(),
};
const tripShape = {
  days: z.number().int().min(1).max(14).nullable(),
  months: z.array(z.number().int().min(1).max(12)).max(12),
  party: z.enum(["solo", "couple", "family", "friends"]).nullable(),
  // Aeroporti siciliani di arrivo: elenco unico in src/lib/flights/airports.ts.
  airport: z.enum(SICILY_AIRPORT_CODES).nullable(),
  budgetPerDayEur: z.number().int().min(0).max(2000).nullable(),
  car: z.enum(["own", "rental", "none"]).nullable(),
};
const answersShape = { ...tasteShape, ...tripShape };

// Gusti (valgono per tutti i viaggi) e viaggio (di questa volta): docs/spec.md, M4 parte 5.
// null = domanda saltata (valori neutri in src/lib/onboarding.ts).
const onboardingSchema = z.object({
  locale: z.enum(routing.locales),
  ...answersShape,
  // Solo per chi non ha ancora una sessione: serve a crearne una da ospite.
  captchaToken: z.string().min(1).max(4096).optional(),
});

// La lingua arriva come stringa dal client: la valida Zod.
export type OnboardingInput = Omit<z.input<typeof onboardingSchema>, "locale"> & { locale: string };
export type ActionError = { status: "error"; code: "invalid" | "captcha_failed" | "failed" };

export async function submitOnboarding(input: OnboardingInput): Promise<ActionError> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const { locale, captchaToken, ...answers } = parsed.data;

  let user = await getUser();
  if (!user) {
    if (!captchaToken) return { status: "error", code: "captcha_failed" };
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInAnonymously({ options: { captchaToken } });
    if (error || !data.user) return { status: "error", code: error?.code === "captcha_failed" ? "captcha_failed" : "failed" };
    user = data.user;
  }

  try {
    await saveAnswers(user, answers);
  } catch {
    return { status: "error", code: "failed" };
  }
  redirect(`/${locale}/viaggio/proposte`);
}

const tripSchema = z.object({ locale: z.enum(routing.locales), ...tripShape });
export type TripInput = Omit<z.input<typeof tripSchema>, "locale"> & { locale: string };

// "Il tuo prossimo viaggio": chi ha già i gusti completati sceglie solo il viaggio.
export async function submitTrip(input: TripInput): Promise<ActionError> {
  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { locale, ...trip } = parsed.data;
  try {
    // Senza gusti completati la schermata singola non esiste: si fa il percorso completo.
    const saved = await getSavedPreferences(user);
    if (!saved?.completed) return { status: "error", code: "invalid" };
    await saveTrip(user, trip);
  } catch {
    return { status: "error", code: "failed" };
  }
  // Le pagine personali in cache nel browser mostrano i valori nuovi anche con Indietro.
  revalidatePath("/", "layout");
  redirect(`/${locale}/viaggio/proposte`);
}

const preferencesSchema = z.object({
  locale: z.enum(routing.locales),
  ...tasteShape,
  reducedMobility: z.boolean(),
  diet: z.array(z.enum(DIETS)).max(DIETS.length),
  heatTolerance: z.number().int().min(0).max(5).nullable(),
  crowdTolerance: z.number().int().min(0).max(5).nullable(),
  sensitiveConsent: z.boolean(),
});

export type PreferencesInput = Omit<z.input<typeof preferencesSchema>, "locale"> & { locale: string };

// Pagina Preferenze: solo i gusti (interessi e pesi, ritmo, tolleranze, mobilità e dieta).
// Il viaggio si cambia da "Crea il tuo viaggio".
export async function savePreferences(input: PreferencesInput): Promise<ActionError> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { locale, reducedMobility, diet, heatTolerance, crowdTolerance, sensitiveConsent, ...tastes } = parsed.data;
  try {
    await saveTastes(user, tastes);
    await saveExtraPreferences(user, { reducedMobility, diet, heatTolerance, crowdTolerance, sensitiveConsent });
  } catch {
    return { status: "error", code: "failed" };
  }
  revalidatePath("/", "layout");
  redirect(`/${locale}/preferenze?salvate=1`);
}

const localeOnly = z.object({ locale: z.enum(routing.locales) });

// "Cancella questi dati": mobilità ridotta, dieta e consenso tornano vuoti.
export async function deleteSensitivePreferences(input: { locale: string }): Promise<ActionError> {
  const parsed = localeOnly.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  try {
    await clearSensitivePreferences(user);
  } catch {
    return { status: "error", code: "failed" };
  }
  redirect(`/${parsed.data.locale}/preferenze?cancellati=1`);
}
