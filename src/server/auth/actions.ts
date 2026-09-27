"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { routing } from "@/lib/i18n/routing";
import { createClient } from "@/server/supabase/server";

const localeSchema = z.enum(routing.locales);

const emailSignInSchema = z.object({
  email: z.email().max(254),
  locale: localeSchema,
});

export type EmailSignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; code: "invalid_email" | "failed" };

function callbackUrl(locale: string) {
  const url = new URL("/api/auth/callback", publicEnv.NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("next", `/${locale}/profilo`);
  return url.toString();
}

export async function signInWithEmail(
  _prev: EmailSignInState,
  formData: FormData,
): Promise<EmailSignInState> {
  const parsed = emailSignInSchema.safeParse({
    email: formData.get("email"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) return { status: "error", code: "invalid_email" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callbackUrl(parsed.data.locale) },
  });
  if (error) return { status: "error", code: "failed" };

  return { status: "sent", email: parsed.data.email };
}

export async function signInWithGoogle(formData: FormData) {
  const locale = localeSchema.parse(formData.get("locale"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(locale) },
  });
  if (error || !data.url) redirect(`/${locale}/login?error=oauth`);

  redirect(data.url);
}

export async function signOut(formData: FormData) {
  const locale = localeSchema.catch(routing.defaultLocale).parse(formData.get("locale"));

  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect(`/${locale}`);
}
