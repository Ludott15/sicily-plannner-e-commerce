import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { EarnedBadges } from "@/components/badges/earned-badges";
import { ButtonLink, PointsPill, Stamp } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/server/auth";
import { getMyBadges } from "@/server/gamification/badges";
import { getMyPoints } from "@/server/gamification/queries";

// I miei punti (passo 5.1). Saldo, movimenti, regole di guadagno, badge (passo 5.2) e il regolamento
// (/punti/regolamento). L'ospite vede come creare l'account: i punti sono degli account.
// Intestazione di pagina con il saldo nella riga dei fatti; sezioni separate da divider, senza card.

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Motivi che guadagnano punti, nell'ordine in cui li mostra la tabella.
const EARNING_REASONS = ["profile_completed", "invite_accepted", "itinerary_completed", "review", "check_in"] as const;
// Motivi che compaiono nei movimenti: quelli di guadagno più le correzioni dell'admin e i riscatti.
const KNOWN_REASONS = [...EARNING_REASONS, "admin_adjust", "redeem_refund"] as const;
type KnownReason = (typeof KNOWN_REASONS)[number];

function isKnownReason(reason: string): reason is KnownReason {
  return (KNOWN_REASONS as readonly string[]).includes(reason);
}

type Props = { params: Promise<{ locale: string }> };

export default async function PointsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [t, tLeaderboard] = await Promise.all([getTranslations("Points"), getTranslations("Leaderboard")]);

  if (user.is_anonymous) {
    return (
      <PageContainer>
        <PageHeader title={t("title")} eyebrow={t("eyebrow")} />
        <section aria-labelledby="ospite-punti" className="flex flex-col items-start gap-4 border-t border-divider pt-8">
          <h2 id="ospite-punti" className="is-display text-heading-2">
            {t("guestTitle")}
          </h2>
          <p className="text-body text-lava-muted">{t("guestText")}</p>
          <ButtonLink href="/profilo" variant="primary">
            {t("guestCta")}
          </ButtonLink>
        </section>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/classifica" variant="secondary">
            {tLeaderboard("pointsLink")}
          </ButtonLink>
          <ButtonLink href="/punti/regolamento" variant="secondary">
            {t("rulesLink")}
          </ButtonLink>
        </div>
      </PageContainer>
    );
  }

  const [data, badges, format, tBadges] = await Promise.all([
    getMyPoints(user, locale),
    getMyBadges(user, locale),
    getFormatter(),
    getTranslations("Badges"),
  ]);
  const grouping = { useGrouping: "always" } as const;

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        eyebrow={t("eyebrow")}
        meta={
          <span className="flex flex-wrap items-center gap-3">
            <PointsPill points={data.balance} />
            <span>{t("balanceLabel")}</span>
          </span>
        }
      />

      <section aria-labelledby="come-si-guadagna" className="flex flex-col gap-4">
        <h2 id="come-si-guadagna" className="is-display text-heading-2">
          {t("rulesTitle")}
        </h2>
        <ul className="flex flex-col">
          {EARNING_REASONS.map((reason) => {
            const points = data.rules[reason];
            if (points === undefined) return null;
            return (
              <li key={reason} className="flex items-baseline justify-between gap-4 border-b border-divider py-3">
                <span className="text-body">{t(`reasons.${reason}`)}</span>
                <span className="text-body font-semibold">{t("rulePoints", { points })}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="movimenti" className="flex flex-col gap-4">
        <h2 id="movimenti" className="is-display text-heading-2">
          {t("movementsTitle")}
        </h2>
        {data.movements.length === 0 ? (
          <p className="text-body text-lava-muted">{t("movementsEmpty")}</p>
        ) : (
          <ul className="flex flex-col">
            {data.movements.map((movement) => (
              <li key={movement.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-divider py-3">
                <span className="flex flex-col">
                  <span className="text-body">
                    {isKnownReason(movement.reason) ? t(`reasons.${movement.reason}`) : t("reasons.other")}
                  </span>
                  <time dateTime={movement.createdAt} className="text-caption text-lava-muted">
                    {format.dateTime(new Date(movement.createdAt), { dateStyle: "medium" })}
                  </time>
                </span>
                <span className="text-body font-semibold">
                  {format.number(movement.delta, { ...grouping, signDisplay: "always" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="i-tuoi-badge" className="flex flex-col gap-4">
        <h2 id="i-tuoi-badge" className="is-display text-heading-2">
          {tBadges("earnedTitle")}
        </h2>
        <EarnedBadges items={badges.earned} />
      </section>

      <section aria-labelledby="prossimi-badge" className="flex flex-col gap-4">
        <h2 id="prossimi-badge" className="is-display text-heading-2">
          {t("badgesTitle")}
        </h2>
        {data.nextBadges.length === 0 ? (
          <p className="text-body text-lava-muted">{t("badgesEmpty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-6">
            {data.nextBadges.map((badge) => (
              <li key={badge.key}>
                <Stamp
                  badgeKey={badge.key}
                  name={badge.name}
                  locked
                  progress={tBadges("progress", { current: badge.current, target: badge.target })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/classifica" variant="secondary">
          {tLeaderboard("pointsLink")}
        </ButtonLink>
        <ButtonLink href="/punti/regolamento" variant="secondary">
          {t("rulesLink")}
        </ButtonLink>
      </div>
    </PageContainer>
  );
}
