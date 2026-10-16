import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink, PendingButton } from "@/components/design";
import { SectionSkeleton } from "@/components/groups/section-skeleton";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { currentSeasonKey, isSeasonKey, seasonParts, shiftSeason } from "@/lib/season-nav";
import { getUser } from "@/server/auth";
import { getSeasonalLeaderboard } from "@/server/gamification/leaderboard";
import { getLeaderboardSettings } from "@/server/gamification/leaderboard";

// Classifica stagionale (passo 5.3). La lista è pubblica: primi 50 senza chi ha scelto di non
// comparire, e il server non manda mai email, id o storico. Chi ha l'account vede anche la propria
// posizione, anche se è fuori dalla lista. Il regolamento è in sospeso (marcatore points.rules,
// come in /punti). Non si indicizza: mostra nomi di persone.
// Le stagioni sono in una riga di pulsanti sotto l'intestazione; la posizione personale è una riga
// con divider, non una card.

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ stagione?: string }> };
type Member = NonNullable<Awaited<ReturnType<typeof getUser>>>;

const GROUPING = { useGrouping: "always" } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Leaderboard" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

async function Standings({
  member,
  season,
  title,
  caption,
}: {
  member: Member | null;
  season: string | undefined;
  title: string;
  caption: string;
}) {
  const [t, format, board, settings] = await Promise.all([
    getTranslations("Leaderboard"),
    getFormatter(),
    getSeasonalLeaderboard(member, season).catch(() => null),
    member ? getLeaderboardSettings(member).catch(() => null) : null,
  ]);

  return (
    <>
      <section aria-labelledby="classifica-stagione" className="flex flex-col gap-4">
        <h2 id="classifica-stagione" className="is-display text-heading-2">
          {title}
        </h2>
        {board === null ? (
          <p role="alert" className="text-body text-lava-muted">
            {t("failed")}
          </p>
        ) : board.rows.length === 0 ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-body text-lava-muted">{t("empty")}</p>
            <ButtonLink href="/viaggio/nuovo" variant="secondary">
              {t("emptyCta")}
            </ButtonLink>
          </div>
        ) : (
          <LeaderboardTable rows={board.rows} caption={caption} />
        )}
      </section>

      {member !== null && board !== null && (
        <section aria-labelledby="la-tua-posizione" className="flex flex-col gap-3 border-t border-divider pt-6">
          <h2 id="la-tua-posizione" className="is-display text-heading-3">
            {t("meTitle")}
          </h2>
          {settings?.optOut && <p className="text-body text-lava-muted">{t("meHidden")}</p>}
          {board.me ? (
            <p className="text-body">
              {t("meRank", {
                rank: String(board.me.rank),
                points: format.number(board.me.points, GROUPING),
              })}
            </p>
          ) : (
            <p className="text-body text-lava-muted">{t("meNone")}</p>
          )}
          {settings?.optOut && (
            <div>
              <ButtonLink href="/profilo" variant="secondary" size="sm">
                {t("manageCta")}
              </ButtonLink>
            </div>
          )}
        </section>
      )}
    </>
  );
}

export default async function LeaderboardPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { stagione } = await searchParams;
  const season = isSeasonKey(stagione) ? stagione : undefined;
  const shownKey = season ?? currentSeasonKey();
  const current = currentSeasonKey();
  const user = await getUser();
  const member = user !== null && !user.is_anonymous ? user : null;

  const t = await getTranslations("Leaderboard");
  const parts = seasonParts(shownKey);
  const title = parts
    ? parts.half === "summer"
      ? t("seasonSummer", { year: String(parts.year) })
      : t("seasonWinter", { year: String(parts.year), nextYear: String(parts.year + 1) })
    : shownKey;

  return (
    <PageContainer>
      <PageHeader title={t("title")} eyebrow={t("eyebrow")} subtitle={t("intro")} />
      <nav aria-label={t("seasonNav")} className="flex flex-wrap gap-3">
        <ButtonLink
          href="/classifica"
          variant="secondary"
          size="sm"
          aria-current={shownKey === current ? "page" : undefined}
        >
          {t("currentSeason")}
        </ButtonLink>
        <ButtonLink
          href={`/classifica?stagione=${shiftSeason(current, -1)}`}
          variant="secondary"
          size="sm"
          aria-current={shownKey === shiftSeason(current, -1) ? "page" : undefined}
        >
          {t("previousSeason")}
        </ButtonLink>
      </nav>

      <Suspense fallback={<SectionSkeleton label={t("loading")} />}>
        <Standings member={member} season={season} title={title} caption={t("caption", { season: title })} />
      </Suspense>

      {member === null && (
        <section className="flex flex-col items-start gap-4 border-t border-divider pt-6">
          <p className="text-body text-lava-muted">{t("joinText")}</p>
          <ButtonLink href="/login" variant="secondary">
            {t("joinCta")}
          </ButtonLink>
        </section>
      )}

      <div>
        <PendingButton id="points.rules" variant="secondary">
          {t("rulesLink")}
        </PendingButton>
      </div>
    </PageContainer>
  );
}
