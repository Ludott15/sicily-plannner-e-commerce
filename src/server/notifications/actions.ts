"use server";

import { revalidatePath } from "next/cache";
import { isNull, sql } from "drizzle-orm";
import { requireUser } from "@/server/auth";
import { notifications } from "@/server/db/schema";
import { dbAsUser } from "@/server/db/user";

// Segna come lette le notifiche dell'utente (passo 4.2). La RLS limita l'update alle proprie righe
// e alla sola colonna read_at.

export type NotificationsState = { status: "ok" } | { status: "error"; code: "failed" };

export async function markNotificationsRead(): Promise<NotificationsState> {
  const user = await requireUser();
  try {
    await dbAsUser(user, (tx) =>
      tx.update(notifications).set({ readAt: sql`now()` }).where(isNull(notifications.readAt)),
    );
  } catch {
    return { status: "error", code: "failed" };
  }
  revalidatePath("/", "layout");
  return { status: "ok" };
}
