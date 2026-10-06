"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { routing } from "@/lib/i18n/routing";
import { getUser, requireUser } from "@/server/auth";
import { createClient } from "@/server/supabase/server";
import { clearSensitivePreferences, saveAnswers, saveExtraPreferences } from "./data";

// Onboarding e Preferenze (M4): Zod → utente (o nuova sessione ospite, protetta da Turnstile)
// → scrittura con dbAsUser. Sono dati personali: restano dell'utente, e nella conversione da
// ospite ad account restano suoi (stesso user id).

const DIETS = ["vegetarian", "vegan", "gluten_free", "lactose_free"] as const;
const interestKey = z.string().regex(/^[a-z_]{1,40}$/);

const answersShape = {
  // null = domanda saltata (valori neutri in src/lib/onboarding.ts).
  days: z.number().int().min(1).max(14).nullable(),
  months: z.array(z.number().int().min(1).max(12)).max(12),
  interests: z.array(interestKey).max(30),
  weights: z.record(interestKey, z.number().int().min(0).max(5)),
  pace: z.enum(["relaxed", "balanced", "intense"]).nullable(),
  party: z.enum(["solo", "couple", "family", "friends"]).nullable(),
  airport: z.enum(["CTA", "PMO", "TPS", "CIY"]).nullable(),
  budgetPerDayEur: z.number().int().min(0).max(2000).nullable(),
  car: z.enum(["own", "rental", "none"]).nullable(),
};

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

const preferencesSchema = z.object({
  locale: z.enum(routing.locales),
  ...answersShape,
  reducedMobility: z.boolean(),
  diet: z.array(z.enum(DIETS)).max(DIETS.length),
  heatTolerance: z.number().int().min(0).max(5).nullable(),
  crowdTolerance: z.number().int().min(0).max(5).nullable(),
  sensitiveConsent: z.boolean(),
});

export type PreferencesInput = Omit<z.input<typeof preferencesSchema>, "locale"> & { locale: string };

// Pagina Preferenze: tutte le risposte più mobilità ridotta, dieta e tolleranze.
export async function savePreferences(input: PreferencesInput): Promise<ActionError> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };
  const user = await requireUser();
  const { locale, reducedMobility, diet, heatTolerance, crowdTolerance, sensitiveConsent, ...answers } = parsed.data;
  try {
    await saveAnswers(user, answers);
    await saveExtraPreferences(user, { reducedMobility, diet, heatTolerance, crowdTolerance, sensitiveConsent });
  } catch {
    return { status: "error", code: "failed" };
  }
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
