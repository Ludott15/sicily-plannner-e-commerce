import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { CommonInterests } from "@/components/groups/common-interests";
import { GroupLeaderboard } from "@/components/groups/group-leaderboard";
import { GroupMenu } from "@/components/groups/group-menu";
import { GroupProposals } from "@/components/groups/group-proposals";
import { InviteDialog } from "@/components/groups/invite-dialog";
import { MemberActions } from "@/components/groups/member-actions";
import { MemberAvatar } from "@/components/groups/member-avatar";
import { MemberStack } from "@/components/groups/member-stack";
import { SectionSkeleton } from "@/components/groups/section-skeleton";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs } from "@/components/layout/tabs";
import { Link } from "@/lib/i18n/navigation";
import { activeTab, tabIds } from "@/lib/tabs";
import { requireUser } from "@/server/auth";
import { getGroup } from "@/server/groups/queries";

// Pagina del gruppo (4.1, riprogettata in 6.1). Solo i membri la aprono: getGroup legge con dbAsUser,
// quindi per chi non è (più) membro il gruppo non esiste (404). Intestazione con il nome, il viaggio
// collegato, gli avatar dei membri, l'azione "Invita" (solo owner) e il menu ⋯. Schede su ?scheda=:
// Panoramica (persone, interessi comuni, classifica compatta) · Viaggi proposti · Classifica.
// Ogni sezione carica da sola (Suspense): un errore o un'attesa non blocca il resto.
type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ scheda?: string | string[] }>;
};

const TABS = ["panoramica", "viaggi", "classifica"] as const;

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function GroupPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const [group, query, t, tLeaderboard] = await Promise.all([
    getGroup(user, id),
    searchParams,
    getTranslations("Groups"),
    getTranslations("Leaderboard"),
  ]);
  if (!group) notFound();

  const tab = activeTab(TABS, query.scheda);
  const ids = tabIds("group", tab);
  const tabs = [
    { id: "panoramica", label: t("v2.tabOverview") },
    { id: "viaggi", label: t("v2.tabTrips") },
    { id: "classifica", label: t("v2.tabRanking") },
  ];
  const trip = group.itineraryId ? { id: group.itineraryId, title: group.itineraryTitle } : null;

  const meta = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <MemberStack members={group.members} />
      <span>{t("memberCount", { count: group.members.length })}</span>
      {trip ? (
        <Link href={`/viaggi/${trip.id}`} className="font-semibold text-lava underline-offset-4 hover:underline">
          {trip.title ? t("tripLine", { title: trip.title }) : t("openTripPlain")}
        </Link>
      ) : (
        <span>{t("noTrip")}</span>
      )}
    </div>
  );

  return (
    <PageContainer width="work">
      <PageHeader
        breadcrumb={[{ label: t("v2.crumbGroups"), href: "/gruppi" }]}
        breadcrumbLabel={t("v2.breadcrumbLabel")}
        eyebrow={t("eyebrow")}
        title={group.name}
        meta={meta}
        primaryAction={
          group.isOwner ? <InviteDialog groupId={group.id} locale={locale} activeLink={group.activeLink} /> : undefined
        }
        menu={
          <GroupMenu groupId={group.id} locale={locale} name={group.name} isOwner={group.isOwner} trip={trip} />
        }
      />

      <Tabs idPrefix="group" label={t("v2.tabsLabel")} tabs={tabs} value={tab} />

      <div id={ids.panel} role="tabpanel" aria-labelledby={ids.tab} className="flex flex-col gap-10 md:gap-12">
        {tab === "panoramica" && (
          <>
            <section aria-labelledby="group-members" className="flex flex-col gap-3">
              <h2 id="group-members" className="text-heading-3">
                {t("membersHeading")}
              </h2>
              {group.members.length === 1 && <p className="text-body text-lava-muted">{t("v2.soloMember")}</p>}
              <ul className="flex flex-col divide-y divide-divider">
                {group.members.map((member) => {
                  const isMe = member.userId === user.id;
                  const name = member.displayName ?? t("unnamedMember");
                  return (
                    <li key={member.userId} className="flex flex-wrap items-center gap-3 py-4">
                      <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="break-words font-semibold">
                          {name}
                          {isMe && <span className="font-normal text-lava-muted">{t("youSuffix")}</span>}
                        </span>
                        <span className="text-body-s text-lava-muted">
                          {member.role === "owner" ? t("roleOwner") : t("roleMember")}
                        </span>
                      </div>
                      {group.isOwner && member.role === "member" && (
                        <MemberActions groupId={group.id} userId={member.userId} name={name} />
                      )}
                    </li>
                  );
                })}
              </ul>
              {group.isOwner && <p className="text-body-s text-lava-muted">{t("ownerLeaveHint")}</p>}
            </section>

            <Suspense fallback={<SectionSkeleton label={t("interestsLoading")} />}>
              <CommonInterests user={user} groupId={group.id} locale={locale} />
            </Suspense>

            <Suspense fallback={<SectionSkeleton label={tLeaderboard("groupLoading")} />}>
              <GroupLeaderboard
                user={user}
                groupId={group.id}
                memberCount={group.members.length}
                variant="compact"
              />
            </Suspense>
          </>
        )}

        {tab === "viaggi" && (
          <Suspense fallback={<SectionSkeleton label={t("proposalsLoading")} />}>
            <GroupProposals user={user} groupId={group.id} locale={locale} />
          </Suspense>
        )}

        {tab === "classifica" && (
          <Suspense fallback={<SectionSkeleton label={tLeaderboard("groupLoading")} />}>
            <GroupLeaderboard user={user} groupId={group.id} memberCount={group.members.length} variant="full" />
          </Suspense>
        )}
      </div>
    </PageContainer>
  );
}
