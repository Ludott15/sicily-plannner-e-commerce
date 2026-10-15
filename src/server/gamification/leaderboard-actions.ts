"use server";

import "server-only";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SettingsFormState } from "@/lib/leaderboard-form";
import { requireUser } from "@/server/auth";
import { dbAsUser } from "@/server/db/user";
import { matchCode, pgErrorMessage } from "./pg";

// Impostazioni della classifica (passo 5.3): opt-out e nome pubblico. Zod → requireUser → funzione
// SQL SECURITY DEFINER via dbAsUser (che blocca gli ospiti con guest_not_allowed).

const optOutSchema = z.object({ optOut: z.boolean() });

// Nome pubblico: testo vuoto torna al nome dell'account (iniziali). Massimo 40 caratteri.
const publicNameSchema = z.object({ displayName: z.string().trim().max(40) });

const SETTINGS_CODES = ["guest_not_allowed", "invalid_name", "invalid_value", "not_authenticated"] as const;

// Esegue la scrittura e traduce i codici di dominio di Postgres nel contratto del form.
async function saveSettings(write: () => Promise<unknown>): Promise<SettingsFormState> {
  try {
    await write();
    return { status: "saved" };
  } catch (error) {
    // Il messaggio del wrapper del driver contiene i parametri: si legge solo il codice di dominio.
    const code = matchCode(pgErrorMessage(error), SETTINGS_CODES);
    if (code === "guest_not_allowed") return { status: "error", code: "guest_not_allowed" };
    if (code === "invalid_name" || code === "invalid_value") return { status: "error", code: "invalid" };
    return { status: "error", code: "failed" };
  }
}

function revalidateLeaderboard(): void {
  revalidatePath("/[locale]/classifica", "page");
  revalidatePath("/[locale]/preferenze", "page");
  revalidatePath("/[locale]/punti", "page");
}

export async function setLeaderboardOptOut(
  _prev: SettingsFormState,
  input: { optOut: boolean },
): Promise<SettingsFormState> {
  const parsed = optOutSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };

  const user = await requireUser();
  const result = await saveSettings(() =>
    dbAsUser(user, (tx) => tx.execute(sql`select public.set_leaderboard_opt_out(${parsed.data.optOut})`)),
  );
  if (result.status === "saved") revalidateLeaderboard();
  return result;
}

export async function setPublicName(
  _prev: SettingsFormState,
  input: { displayName: string },
): Promise<SettingsFormState> {
  const parsed = publicNameSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "invalid" };

  const user = await requireUser();
  const result = await saveSettings(() =>
    dbAsUser(user, (tx) => tx.execute(sql`select public.set_public_name(${parsed.data.displayName})`)),
  );
  if (result.status === "saved") revalidateLeaderboard();
  return result;
}
