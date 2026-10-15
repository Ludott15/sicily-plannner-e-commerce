import "server-only";
import { desc, isNull, sql } from "drizzle-orm";
import { notifications } from "@/server/db/schema";
import { dbAsUser, type DbUser } from "@/server/db/user";

// Notifiche dell'utente (passo 4.2). Con dbAsUser la RLS limita alle proprie righe.

export type NotificationKind = "proposal_accepted" | "proposal_rejected";

export type NotificationView = {
  id: string;
  kind: NotificationKind;
  payload: Record<string, string | number | null>;
  readAt: string | null;
  createdAt: string;
};

const LIST_LIMIT = 50;

export async function unreadNotificationsCount(user: DbUser): Promise<number> {
  return dbAsUser(user, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(isNull(notifications.readAt));
    return Number(row?.n ?? 0);
  });
}

function kindOf(value: string): NotificationKind {
  return value === "proposal_rejected" ? "proposal_rejected" : "proposal_accepted";
}

export async function listNotifications(user: DbUser): Promise<NotificationView[]> {
  return dbAsUser(user, async (tx) => {
    const rows = await tx
      .select({
        id: notifications.id,
        kind: notifications.kind,
        payload: notifications.payload,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(LIST_LIMIT);
    return rows.map((r) => ({
      id: r.id,
      kind: kindOf(r.kind),
      payload: r.payload,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}
