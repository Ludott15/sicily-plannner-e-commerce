import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { EarnedBadges } from "@/components/badges/earned-badges";
import { ButtonLink, PendingButton, PointsPill, Stamp } from "@/components/design";
import { requireUser } from "@/server/auth";
import { getMyBadges } from "@/server/gamification/badges";
import { getMyPoints } from "@/server/gamification/queries";

// I miei punti (passo 5.1). Saldo, movimenti, regole di guadagno, badge (passo 5.2) e il regolamento
// (testo legale in sospeso). L'ospite vede come creare l'account: i punti sono degli account.

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
      <section className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 py-8 md:px-16 md:py-12">
        <header className="flex flex-col gap-2">
          <p className="text-label uppercase text-lava-muted">{t("eyebrow")}</p>
          <h1 className="is-display text-display-l">{t("title")}</h1>
        </header>
        <div className="flex flex-col items-start gap-4 rounded-lg border border-card-edge bg-calce-raised p-6">
          <h2 className="is-display text-heading-2">{t("guestTitle")}</h2>
          <p className="text-body text-lava-muted">{t("guestText")}</p>
          <ButtonLink href="/profilo" variant="primary">
            {t("guestCta")}
          </ButtonLink>
        </div>
        <div>
          <ButtonLink href="/classifica" variant="secondary">
            {tLeaderboard("pointsLink")}
          </ButtonLink>
        </div>
        <div>
          <PendingButton id="points.rules" variant="secondary">
            {t("rulesLink")}
          </PendingButton>
        </div>
      </section>
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
    <section className="mx-auto flex w-full max-w-[720px] flex-col gap-10 px-4 py-8 md:px-16 md:py-12">
      <header className="flex flex-col gap-4">
        <p className="text-label uppercase text-lava-muted">{t("eyebrow")}</p>
        <h1 className="is-display text-display-l">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-4">
          <PointsPill points={data.balance} />
          <span className="text-body text-lava-muted">{t("balanceLabel")}</span>
        </div>
      </header>

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

      <div>
        <ButtonLink href="/classifica" variant="secondary">
          {tLeaderboard("pointsLink")}
        </ButtonLink>
      </div>

      <div>
        <PendingButton id="points.rules" variant="secondary">
          {t("rulesLink")}
        </PendingButton>
      </div>
    </section>
  );
}
