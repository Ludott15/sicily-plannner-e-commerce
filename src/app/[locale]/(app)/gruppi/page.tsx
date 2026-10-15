import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Link } from "@/lib/i18n/navigation";
import { initialsOf } from "@/lib/initials";
import { requireUser } from "@/server/auth";
import { listMyGroups } from "@/server/groups/queries";

// I tuoi gruppi (brief 6.1, /gruppi): i gruppi di cui l'utente è membro, uno per riga. Ogni riga dice
// chi c'è (le prime quattro iniziali o foto), quanti sono, il viaggio collegato e il ruolo.
// Senza gruppi lo stato vuoto spiega come nasce un gruppo e porta ai viaggi, dove si crea.
type Props = { params: Promise<{ locale: string }> };

const AVATARS_SHOWN = 4;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Groups" });
  return { title: t("listTitle"), robots: { index: false, follow: false } };
}

export default async function GroupsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [groups, t] = await Promise.all([listMyGroups(user), getTranslations("Groups")]);

  return (
    <PageContainer>
      <PageHeader title={t("listTitle")} subtitle={t("listIntro")} />

      {groups.length === 0 ? (
        <div className="flex flex-col items-start gap-4 border-t border-divider pt-8">
          <p className="text-body-l text-lava-muted">{t("listEmpty")}</p>
          <ButtonLink href="/viaggi" variant="secondary">
            {t("listEmptyAction")}
          </ButtonLink>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-divider">
          {groups.map((group) => {
            const shown = group.members.slice(0, AVATARS_SHOWN);
            return (
              <li key={group.id} className="flex flex-col gap-3 py-6 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link
                    href={`/gruppi/${group.id}`}
                    className="text-heading-3 no-underline hover:underline underline-offset-4"
                  >
                    {group.name}
                  </Link>
                  <span className="text-body-s text-lava-muted">
                    {group.role === "owner" ? t("roleOwner") : t("roleMember")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-s text-lava-muted">
                  <ul aria-hidden="true" className="flex -space-x-2">
                    {shown.map((member, index) => (
                      <li
                        key={`${group.id}-${index}`}
                        className="grid size-8 place-items-center overflow-hidden rounded-pill border-2 border-calce bg-coccio-tint text-caption font-semibold text-coccio-text"
                      >
                        {member.avatarUrl ? (
                          <Image src={member.avatarUrl} alt="" width={32} height={32} unoptimized className="size-8 object-cover" />
                        ) : (
                          (initialsOf(member.displayName) ?? "?")
                        )}
                      </li>
                    ))}
                  </ul>
                  <span>{t("memberCount", { count: group.memberCount })}</span>
                  <span>
                    {group.itineraryTitle ? t("tripLine", { title: group.itineraryTitle }) : t("listNoTrip")}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
