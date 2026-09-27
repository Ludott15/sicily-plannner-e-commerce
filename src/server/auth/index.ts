import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect } from "@/lib/i18n/navigation";
import { createClient } from "@/server/supabase/server";

// getUser() verifica il token con Supabase Auth: da usare per ogni decisione di accesso.
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
});

export const getProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, locale, role, created_at")
    .eq("id", userId)
    .maybeSingle();
  return data;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) {
    const locale = await getLocale();
    return redirect({ href: "/login", locale });
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  // 404 invece di 403: non riveliamo l'esistenza dell'area admin.
  if (profile?.role !== "admin") notFound();
  return { user, profile };
}
