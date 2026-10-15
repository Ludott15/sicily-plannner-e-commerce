"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getUser, requireUser } from "@/server/auth";
import { publicEnv } from "@/lib/env";
import { newShareToken, shareTokenHash } from "@/server/crypto/tokens";
import { groupInvites, groups, profiles } from "@/server/db/schema";
import { dbAsUser, type DbUser, type UserTx } from "@/server/db/user";
import { renderGroupInviteEmail } from "@/server/email/group-invite";
import { emailConfigured, sendEmail } from "@/server/email/send";
import { getSavedPreferences } from "@/server/personalization/data";
import { GroupActionError, groupErrorCodeOf } from "./errors";
import { allowEmailInvite, inviteEmailLimitConfigured } from "./rate-limit";
import {
  acceptInviteSchema,
  createGroupSchema,
  groupLocaleSchema,
  groupOnlySchema,
  memberSchema,
  renameGroupSchema,
  sendEmailInviteSchema,
} from "./schemas";
import {
  INVITE_LINK_MAX_USES,
  type EmailInviteState,
  type GroupErrorCode,
  type GroupFormState,
  type InviteLinkState,
} from "./state";

// Gruppi (passo 4.1). Ogni azione: Zod → requireUser (o getUser per l'invito) → dbAsUser. La RLS
// e le funzioni SECURITY DEFINER (create_group, accept_invite, leave_group, remove_group_member,
// transfer_group_ownership) sono la seconda difesa: gli errori di dominio arrivano come P0001 e
// si mappano in GroupErrorCode. Il token dell'invito non compare mai nei log né negli errori.

const OK: GroupFormState = { status: "ok" };

function fail(code: GroupErrorCode): GroupFormState {
  return { status: "error", code };
}

function inviteUrl(locale: string, token: string): string {
  return new URL(`/${locale}/invito/${token}`, publicEnv.NEXT_PUBLIC_SITE_URL).toString();
}

function revalidateGroups() {
  revalidatePath("/", "layout");
}

// Scrittura riservata al proprietario: se il gruppo non è suo, si interrompe prima di scrivere.
async function assertOwner(tx: UserTx, groupId: string, userId: string): Promise<void> {
  const [group] = await tx.select({ ownerId: groups.ownerId }).from(groups).where(eq(groups.id, groupId));
  if (!group || group.ownerId !== userId) throw new GroupActionError("not_group_owner");
}

// Crea il gruppo dal viaggio: create_group collega gruppo e itinerario in modo atomico.
export async function createGroupFromTrip(
  _prev: GroupFormState,
  input: { itineraryId: string; name: string; locale: string },
): Promise<GroupFormState> {
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const user = await requireUser();
  const { itineraryId, name, locale } = parsed.data;

  let groupId: string;
  try {
    const [row] = await dbAsUser(user, (tx) =>
      tx.execute<{ id: string }>(sql`select public.create_group(${name}, ${itineraryId}::uuid) as id`),
    );
    if (!row) return fail("failed");
    groupId = row.id;
  } catch (error) {
    return fail(groupErrorCodeOf(error));
  }
  revalidateGroups();
  redirect(`/${locale}/gruppi/${groupId}`);
}

export async function renameGroup(_prev: GroupFormState, input: { groupId: string; name: string }): Promise<GroupFormState> {
  const parsed = renameGroupSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const user = await requireUser();
  const { groupId, name } = parsed.data;

  try {
    const updated = await dbAsUser(user, (tx) =>
      tx
        .update(groups)
        .set({ name })
        .where(and(eq(groups.id, groupId), eq(groups.ownerId, user.id)))
        .returning({ id: groups.id }),
    );
    if (updated.length === 0) return fail("not_group_owner");
  } catch (error) {
    return fail(groupErrorCodeOf(error));
  }
  revalidateGroups();
  return OK;
}

// Crea il link di invito del gruppo. Il precedente link attivo viene revocato. Il token in chiaro
// torna una volta sola, nell'URL: nel database c'è solo l'hash.
export async function createInviteLink(
  _prev: InviteLinkState,
  input: { groupId: string; locale: string },
): Promise<InviteLinkState> {
  const parsed = groupLocaleSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const user = await requireUser();
  if (user.is_anonymous) return fail("guest_not_allowed");
  const { groupId, locale } = parsed.data;
  const token = newShareToken();

  try {
    await dbAsUser(user, async (tx) => {
      await assertOwner(tx, groupId, user.id);
      await tx
        .update(groupInvites)
        .set({ status: "revoked" })
        .where(and(eq(groupInvites.groupId, groupId), isNull(groupInvites.email), eq(groupInvites.status, "active")));
      // SQL esplicito: authenticated ha il grant di insert solo su queste colonne.
      await tx.execute(sql`
        insert into public.group_invites (group_id, token_hash, invited_by, max_uses)
        values (${groupId}::uuid, ${shareTokenHash(token)}, ${user.id}::uuid, ${INVITE_LINK_MAX_USES})`);
    });
  } catch (error) {
    return fail(groupErrorCodeOf(error));
  }
  revalidateGroups();
  return { status: "created", url: inviteUrl(locale, token) };
}

export async function revokeInviteLink(_prev: GroupFormState, formData: { groupId: string }): Promise<GroupFormState> {
  const parsed = groupOnlySchema.safeParse(formData);
  if (!parsed.success) return fail("invalid");
  const user = await requireUser();
  const { groupId } = parsed.data;

  try {
    await dbAsUser(user, async (tx) => {
      await assertOwner(tx, groupId, user.id);
      await tx
        .update(groupInvites)
        .set({ status: "revoked" })
        .where(and(eq(groupInvites.groupId, groupId), isNull(groupInvites.email), eq(groupInvites.status, "active")));
    });
  } catch (error) {
    return fail(groupErrorCodeOf(error));
  }
  revalidateGroups();
  return OK;
}

// Invito per email: un invito con l'indirizzo, un ingresso, sette giorni. Invio e scrittura sono
// nella stessa transazione: se l'email non parte, l'invito non resta. Senza chiave Resend o senza
// chiave del rate limit non si crea nulla (email_unavailable).
export async function sendEmailInvite(
  _prev: EmailInviteState,
  input: { groupId: string; email: string; locale: string },
): Promise<EmailInviteState> {
  const parsed = sendEmailInviteSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const user = await requireUser();
  if (user.is_anonymous) return fail("guest_not_allowed");
  const { groupId, email, locale } = parsed.data;
  if (!emailConfigured() || !inviteEmailLimitConfigured()) return fail("email_unavailable");

  let allowed: boolean;
  try {
    allowed = await allowEmailInvite(user.id);
  } catch {
    return fail("failed");
  }
  if (!allowed) return fail("rate_limited");

  const token = newShareToken();
  try {
    await dbAsUser(user, async (tx) => {
      const [group] = await tx.select({ name: groups.name, ownerId: groups.ownerId }).from(groups).where(eq(groups.id, groupId));
      if (!group || group.ownerId !== user.id) throw new GroupActionError("not_group_owner");
      const [profile] = await tx.select({ displayName: profiles.displayName }).from(profiles).where(eq(profiles.id, user.id));

      await tx.execute(sql`
        insert into public.group_invites (group_id, token_hash, invited_by, email, max_uses)
        values (${groupId}::uuid, ${shareTokenHash(token)}, ${user.id}::uuid, ${email}, 1)`);

      const rendered = await renderGroupInviteEmail({
        groupName: group.name,
        inviterName: profile?.displayName ?? null,
        url: inviteUrl(locale, token),
        locale,
      });
      const result = await sendEmail({ to: email, subject: rendered.subject, html: rendered.html, text: rendered.text });
      if (result.status === "unavailable") throw new GroupActionError("email_unavailable");
      if (result.status === "failed") throw new GroupActionError("failed");
    });
  } catch (error) {
    return fail(groupErrorCodeOf(error));
  }
  return { status: "sent" };
}

// Ingresso con il link: accept_invite. Se l'utente è già nel gruppo, la funzione restituisce il gruppo.
async function joinWithInvite(user: DbUser, token: string): Promise<string> {
  const [row] = await dbAsUser(user, (tx) =>
    tx.execute<{ group_id: string }>(sql`select public.accept_invite(${token}) as group_id`),
  );
  if (!row) throw new GroupActionError("failed");
  return row.group_id;
}

// Accettazione dalla pagina /invito/[token]. Un ospite non entra. Chi non ha ancora i gusti passa
// prima da /viaggio/nuovo e torna all'invito (next). Senza sessione si va al login con next.
export async function acceptInviteAction(
  _prev: GroupFormState,
  input: { token: string; locale: string },
): Promise<GroupFormState> {
  const parsed = acceptInviteSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { token, locale } = parsed.data;
  const returnPath = `/${locale}/invito/${token}`;

  const user = await getUser();
  if (!user) redirect(`/${locale}/login?next=${encodeURIComponent(returnPath)}`);
  if (user.is_anonymous) return fail("guest_not_allowed");

  let completed: boolean;
  try {
    completed = (await getSavedPreferences(user))?.completed === true;
  } catch {
    return fail("failed");
  }
  if (!completed) redirect(`/${locale}/viaggio/nuovo?next=${encodeURIComponent(returnPath)}`);

  let groupId: string;
  try {
    groupId = await joinWithInvite(user, token);
  } catch (error) {
    return fail(groupErrorCodeOf(error));
  }
  revalidateGroups();
  redirect(`/${locale}/gruppi/${groupId}`);
}

// Esce dal gruppo. Il proprietario non esce: deve prima cedere la proprietà.
export async function leaveGroup(_prev: GroupFormState, input: { groupId: string; locale: string }): Promise<GroupFormState> {
  const parsed = groupLocaleSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const user = await requireUser();
  const { groupId, locale } = parsed.data;

  try {
    await dbAsUser(user, (tx) => tx.execute(sql`select public.leave_group(${groupId}::uuid)`));
  } catch (error) {
    return fail(groupErrorCodeOf(error));
  }
  revalidateGroups();
  redirect(`/${locale}/viaggi`);
}

// Il proprietario rimuove un membro.
export async function removeMember(_prev: GroupFormState, input: { groupId: string; userId: string }): Promise<GroupFormState> {
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const user = await requireUser();
  const { groupId, userId } = parsed.data;

  try {
    await dbAsUser(user, (tx) => tx.execute(sql`select public.remove_group_member(${groupId}::uuid, ${userId}::uuid)`));
  } catch (error) {
    return fail(groupErrorCodeOf(error));
  }
  revalidateGroups();
  return OK;
}

// Il proprietario cede la proprietà a un altro membro (gruppo e itinerario collegato insieme).
export async function transferOwnership(
  _prev: GroupFormState,
  input: { groupId: string; userId: string },
): Promise<GroupFormState> {
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const user = await requireUser();
  const { groupId, userId } = parsed.data;

  try {
    await dbAsUser(user, (tx) =>
      tx.execute(sql`select public.transfer_group_ownership(${groupId}::uuid, ${userId}::uuid)`),
    );
  } catch (error) {
    return fail(groupErrorCodeOf(error));
  }
  revalidateGroups();
  return OK;
}
