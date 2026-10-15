import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { ButtonLink } from "@/components/design";
import { CommonInterests } from "@/components/groups/common-interests";
import { GroupProposals } from "@/components/groups/group-proposals";
import { InviteSection } from "@/components/groups/invite-section";
import { LeaveGroupButton } from "@/components/groups/leave-group-button";
import { MemberActions } from "@/components/groups/member-actions";
import { MemberAvatar } from "@/components/groups/member-avatar";
import { RenameGroupForm } from "@/components/groups/rename-group-form";
import { SectionSkeleton } from "@/components/groups/section-skeleton";
import { requireUser } from "@/server/auth";
import { getGroup } from "@/server/groups/queries";

// Pagina del gruppo (4.1). Solo i membri la aprono: getGroup legge con dbAsUser, quindi per chi
// non è (più) membro il gruppo non esiste (404). Il nome si cambia e gli inviti si gestiscono
// solo per l'owner; i membri non vedono né i link né le preferenze di nessuno.
// Dal passo 4.3: interessi comuni (aggregati) e tre viaggi per il gruppo. Ogni sezione carica
// da sola (Suspense), così un errore o un'attesa non blocca il resto della pagina.
type Props = { params: Promise<{ locale: string; id: string }> };

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function GroupPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const [group, t] = await Promise.all([getGroup(user, id), getTranslations("Groups")]);
  if (!group) notFound();

  const openTrip = group.itineraryId
    ? group.itineraryTitle
      ? t("openTrip", { title: group.itineraryTitle })
      : t("openTripPlain")
    : null;

  return (
    <section className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 py-8 md:px-16 md:py-12">
      <header className="flex flex-col gap-3">
        <p className="text-label uppercase text-lava-muted">{t("eyebrow")}</p>
        <h1 className="is-display text-display-l">{group.name}</h1>
        {group.itineraryId && openTrip ? (
          <div>
            <ButtonLink href={`/viaggi/${group.itineraryId}`} variant="secondary">
              {openTrip}
            </ButtonLink>
          </div>
        ) : (
          <p className="text-body text-lava-muted">{t("noTrip")}</p>
        )}
      </header>

      {group.isOwner && (
        <section aria-labelledby="group-name" className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-4">
          <h2 id="group-name" className="text-heading-3">
            {t("renameHeading")}
          </h2>
          <RenameGroupForm groupId={group.id} name={group.name} />
        </section>
      )}

      <section aria-labelledby="group-members" className="flex flex-col gap-3">
        <h2 id="group-members" className="text-heading-3">
          {t("membersHeading")}
        </h2>
        {group.members.length === 1 && <p className="text-body text-lava-muted">{t("soloMember")}</p>}
        <ul className="flex flex-col divide-y divide-divider rounded-lg border border-card-edge bg-calce-raised">
          {group.members.map((member) => {
            const isMe = member.userId === user.id;
            return (
              <li key={member.userId} className="flex flex-wrap items-center gap-3 p-4">
                <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">
                    {member.displayName ?? t("unnamedMember")}
                    {isMe && <span className="font-normal text-lava-muted">{t("youSuffix")}</span>}
                  </span>
                  <span className="text-body-s text-lava-muted">
                    {member.role === "owner" ? t("roleOwner") : t("roleMember")}
                  </span>
                </div>
                {group.isOwner && member.role === "member" && (
                  <MemberActions
                    groupId={group.id}
                    userId={member.userId}
                    name={member.displayName ?? t("unnamedMember")}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <Suspense fallback={<SectionSkeleton label={t("interestsLoading")} />}>
        <CommonInterests user={user} groupId={group.id} locale={locale} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton label={t("proposalsLoading")} />}>
        <GroupProposals user={user} groupId={group.id} locale={locale} />
      </Suspense>

      {group.isOwner ? (
        <>
          <InviteSection groupId={group.id} locale={locale} activeLink={group.activeLink} />
          <p className="text-body-s text-lava-muted">{t("ownerLeaveHint")}</p>
        </>
      ) : (
        <LeaveGroupButton groupId={group.id} locale={locale} />
      )}
    </section>
  );
}
