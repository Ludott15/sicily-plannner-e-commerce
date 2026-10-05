"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { routing } from "@/lib/i18n/routing";
import { getUser } from "@/server/auth";
import { createClient } from "@/server/supabase/server";
import { saveAnswers } from "./data";

// Onboarding (M4): Zod → utente (o nuova sessione ospite, protetta da Turnstile) → scrittura
// con dbAsUser. Le risposte sono dati personali: restano dell'utente, e nella conversione da
// ospite ad account restano sue (stesso user id).

const answersSchema = z.object({
  locale: z.enum(routing.locales),
  days: z.number().int().min(1).max(14),
  months: z.array(z.number().int().min(1).max(12)).max(12),
  weights: z.record(z.string().regex(/^[a-z_]{1,40}$/), z.number().int().min(0).max(5)),
  pace: z.enum(["relaxed", "balanced", "intense"]),
  party: z.enum(["solo", "couple", "family", "friends"]).nullable(),
  budgetPerDayEur: z.number().int().min(0).max(2000).nullable(),
  hasCar: z.boolean(),
  // Solo per chi non ha ancora una sessione: serve a crearne una da ospite.
  captchaToken: z.string().min(1).max(4096).optional(),
});

// La lingua arriva come stringa dal client: la valida Zod.
export type OnboardingInput = Omit<z.input<typeof answersSchema>, "locale"> & { locale: string };
export type OnboardingResult = { status: "error"; code: "invalid" | "captcha_failed" | "failed" };

export async function submitOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  const parsed = answersSchema.safeParse(input);
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
