import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { User } from "@supabase/supabase-js";
import { redirect } from "@/lib/i18n/navigation";
import { profiles } from "@/server/db/schema";
import { dbAsUser } from "@/server/db/user";
import { createClient } from "@/server/supabase/server";

// getUser() verifica il token con Supabase Auth: da usare per ogni decisione di accesso.
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
});

export const getProfile = cache(async (user: User) => {
  const [profile] = await dbAsUser(user, (tx) =>
    tx
      .select({
        id: profiles.id,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        locale: profiles.locale,
        role: profiles.role,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id)),
  );
  return profile ?? null;
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
  const profile = await getProfile(user);
  // 404 invece di 403: non riveliamo l'esistenza dell'area admin.
  if (profile?.role !== "admin") notFound();
  return { user, profile };
}
