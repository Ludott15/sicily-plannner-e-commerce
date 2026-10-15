import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { groupInvites, groups, itineraries } from "@/server/db/schema";
import { dbPublic } from "@/server/db/public";
import { dbAsUser, type DbUser } from "@/server/db/user";

// Letture dei gruppi (passo 4.1). Con dbAsUser la RLS decide (il gruppo lo vedono i membri).
// La pagina pubblica dell'invito usa solo le funzioni SQL (dbPublic): mai le tabelle dei gruppi.

export type InviteStatus = "active" | "expired" | "revoked" | "exhausted" | "not_found";

export type InvitePreview = {
  groupId: string;
  groupName: string;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  itineraryTitle: string | null;
  itineraryDays: number | null;
  expiresAt: string;
  stops: string[];
};

export type InvitePage = { status: "active"; preview: InvitePreview } | { status: Exclude<InviteStatus, "active"> };

export type GroupMemberView = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "owner" | "member";
};

export type GroupView = {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  itineraryId: string | null;
  itineraryTitle: string | null;
  members: GroupMemberView[];
  activeLink: { expiresAt: string; uses: number; maxUses: number } | null;
};

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

const INVITE_STATUSES: readonly InviteStatus[] = ["active", "expired", "revoked", "exhausted", "not_found"];

function toInviteStatus(value: string | undefined): InviteStatus {
  const found = INVITE_STATUSES.find((status) => status === value);
  return found ?? "not_found";
}

type PreviewRow = {
  group_id: string;
  group_name: string;
  owner_display_name: string | null;
  owner_avatar_url: string | null;
  itinerary_title: string | null;
  itinerary_days: number | null;
  expires_at: Date | string;
};

// Stato dell'invito e anteprima per /invito/[token], anche senza account. Senza dati personali
// oltre al nome e alla foto di chi ha creato il gruppo.
export async function getInvitePage(token: string): Promise<InvitePage> {
  if (!TOKEN_FORMAT.test(token)) return { status: "not_found" };

  return dbPublic(async (tx): Promise<InvitePage> => {
    const [statusRow] = await tx.execute<{ status: string }>(sql`select public.invite_link_status(${token}) as status`);
    const status = toInviteStatus(statusRow?.status);
    if (status !== "active") return { status };

    const [row] = await tx.execute<PreviewRow>(sql`
      select group_id, group_name, owner_display_name, owner_avatar_url, itinerary_title, itinerary_days, expires_at
      from public.invite_preview(${token})`);
    if (!row) return { status: "not_found" };

    const stopRows = await tx.execute<{ place_name: string }>(
      sql`select place_name from public.invite_preview_stops(${token})`,
    );
    return {
      status: "active",
      preview: {
        groupId: row.group_id,
        groupName: row.group_name,
        ownerName: row.owner_display_name,
        ownerAvatarUrl: row.owner_avatar_url,
        itineraryTitle: row.itinerary_title,
        itineraryDays: row.itinerary_days === null ? null : Number(row.itinerary_days),
        expiresAt: new Date(row.expires_at).toISOString(),
        stops: stopRows.map((stop) => stop.place_name),
      },
    };
  });
}

// Il gruppo come lo vede chi ne è membro. Null se non esiste o non è visibile (RLS).
// activeLink (link attivo, scadenza e usi) solo per il proprietario.
export async function getGroup(user: DbUser, groupId: string): Promise<GroupView | null> {
  return dbAsUser(user, async (tx) => {
    const [group] = await tx
      .select({ id: groups.id, name: groups.name, ownerId: groups.ownerId, itineraryId: groups.itineraryId })
      .from(groups)
      .where(eq(groups.id, groupId));
    if (!group) return null;

    const trip =
      group.itineraryId === null
        ? null
        : ((await tx.select({ title: itineraries.title }).from(itineraries).where(eq(itineraries.id, group.itineraryId)))[0] ??
          null);

    // Vista group_member_profiles: solo nome e avatar dei compagni, con il filtro di membership.
    const memberRows = await tx.execute<{
      user_id: string;
      role: string;
      display_name: string | null;
      avatar_url: string | null;
    }>(sql`
      select user_id, role::text as role, display_name, avatar_url
      from public.group_member_profiles
      where group_id = ${groupId}::uuid
      order by (role = 'owner') desc, joined_at asc, user_id asc`);

    const isOwner = group.ownerId === user.id;
    let activeLink: GroupView["activeLink"] = null;
    if (isOwner) {
      const [link] = await tx
        .select({ expiresAt: groupInvites.expiresAt, uses: groupInvites.uses, maxUses: groupInvites.maxUses })
        .from(groupInvites)
        .where(
          and(
            eq(groupInvites.groupId, groupId),
            isNull(groupInvites.email),
            eq(groupInvites.status, "active"),
            gt(groupInvites.expiresAt, sql`now()`),
            sql`${groupInvites.uses} < ${groupInvites.maxUses}`,
          ),
        );
      activeLink = link ? { expiresAt: link.expiresAt.toISOString(), uses: link.uses, maxUses: link.maxUses } : null;
    }

    return {
      id: group.id,
      name: group.name,
      ownerId: group.ownerId,
      isOwner,
      itineraryId: group.itineraryId,
      itineraryTitle: trip?.title ?? null,
      members: memberRows.map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        avatarUrl: m.avatar_url,
        role: m.role === "owner" ? "owner" : "member",
      })),
      activeLink,
    };
  });
}
