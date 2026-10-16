import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
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

// Un gruppo nella lista "I miei gruppi": nome e numero di membri, il viaggio collegato e il ruolo
// di chi legge. Gli avatar sono i primi membri (owner in testa, poi per ingresso).
export type MyGroupMemberPreview = {
  displayName: string | null;
  avatarUrl: string | null;
};

export type MyGroup = {
  id: string;
  name: string;
  memberCount: number;
  role: "owner" | "member";
  itineraryId: string | null;
  itineraryTitle: string | null;
  members: MyGroupMemberPreview[];
};

const MEMBER_PREVIEW_LIMIT = 4;

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

// I gruppi di cui l'utente è membro, dal più recente. Con dbAsUser la RLS restituisce solo i gruppi
// in cui è membro (non quelli di cui è stato ex membro). Il viaggio collegato è null se non è
// visibile al membro. Due sole query, niente N+1: il conteggio dei membri è in subquery e gli
// avatar arrivano da una query batch sulla vista dei profili dei membri.
export async function listMyGroups(user: DbUser): Promise<MyGroup[]> {
  return dbAsUser(user, async (tx): Promise<MyGroup[]> => {
    const rows = await tx
      .select({
        id: groups.id,
        name: groups.name,
        ownerId: groups.ownerId,
        itineraryId: groups.itineraryId,
        itineraryTitle: itineraries.title,
        memberCount: sql<number>`(select count(*)::int from public.group_members gm where gm.group_id = ${groups.id})`,
      })
      .from(groups)
      .leftJoin(itineraries, eq(itineraries.id, groups.itineraryId))
      .orderBy(desc(groups.createdAt), desc(groups.id));
    if (rows.length === 0) return [];

    const previewRows = await tx.execute<{
      group_id: string;
      display_name: string | null;
      avatar_url: string | null;
    }>(sql`
      select group_id, display_name, avatar_url
      from (
        select group_id, display_name, avatar_url,
          row_number() over (
            partition by group_id
            order by (role = 'owner') desc, joined_at asc, user_id asc
          ) as position
        from public.group_member_profiles
        where group_id in (${sql.join(
          rows.map((row) => sql`${row.id}::uuid`),
          sql`, `,
        )})
      ) ranked
      where position <= ${MEMBER_PREVIEW_LIMIT}
      order by group_id, position`);

    const previewsByGroup = new Map<string, MyGroupMemberPreview[]>();
    for (const preview of previewRows) {
      const list = previewsByGroup.get(preview.group_id) ?? [];
      list.push({ displayName: preview.display_name, avatarUrl: preview.avatar_url });
      previewsByGroup.set(preview.group_id, list);
    }

    return rows.map((row): MyGroup => ({
      id: row.id,
      name: row.name,
      memberCount: Number(row.memberCount),
      role: row.ownerId === user.id ? "owner" : "member",
      itineraryId: row.itineraryId,
      itineraryTitle: row.itineraryTitle ?? null,
      members: previewsByGroup.get(row.id) ?? [],
    }));
  });
}
