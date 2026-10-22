import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, User } from "lucide-react";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { Button, PointsPill } from "@/components/design";
import { LeaderboardSettings } from "@/components/leaderboard/leaderboard-settings";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Link } from "@/lib/i18n/navigation";
import { getProfile, requireUser } from "@/server/auth";
import { signOut } from "@/server/auth/actions";
import { getLeaderboardSettings } from "@/server/gamification/leaderboard";
import { getHomePoints } from "@/server/gamification/queries";

// Profilo (redesign): testata con iniziali, nome e punti; poi sezioni come liste di impostazioni:
// account, viaggi, attività e premi (con la classifica), preferenze, privacy, uscita.
// Un ospite (sessione anonima) vede i vantaggi dell'account e il form per salvarlo con l'email:
// lo user id resta lo stesso, quindi i viaggi creati da ospite restano suoi.
// Nessun conteggio extra: il profilo non esegue query pesanti per i numeri delle sezioni.

type Props = { params: Promise<{ locale: string }> };

// Le iniziali vengono dal nome pubblico: un valore senza lettere o cifre non è un'iniziale.
function initialsOf(name: string | null | undefined): string | null {
  if (!name) return null;
  const letters = name
    .trim()
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toLocaleUpperCase("it-IT");
  return letters || null;
}

export default async function ProfilePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();

  if (user.is_anonymous) {
    const t = await getTranslations("Guest");
    const benefits = [t("benefitOne"), t("benefitTwo")];
    return (
      <PageContainer>
        <PageHeader title={t("title")} subtitle={t("description")} />

        <section aria-labelledby="guest-benefits" className="flex flex-col gap-4">
          <h2 id="guest-benefits" className="text-heading-3">
            {t("benefitsHeading")}
          </h2>
          <ul className="is-settings">
            {benefits.map((benefit) => (
              <li key={benefit} className="is-setting">
                <span className="is-setting__label font-normal">{benefit}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="guest-save" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 id="guest-save" className="text-heading-3">
              {t("saveHeading")}
            </h2>
            <p className="text-body-s text-lava-muted">{t("saveIntro")}</p>
          </div>
          <EmailCodeForm mode="guest" locale={locale} />
        </section>

        <section aria-label={t("signOut")} className="border-t border-divider pt-8">
          <form action={signOut} className="flex flex-col items-start gap-3">
            <input type="hidden" name="locale" value={locale} />
            <p className="text-body-s text-lava-muted">{t("signOutWarning")}</p>
            <Button type="submit" variant="secondary" size="sm">
              {t("signOut")}
            </Button>
          </form>
        </section>
      </PageContainer>
    );
  }

  const [profile, points, t, tOrders, format, tPoints, tNotifications, tNav, leaderboard, tLeaderboard] = await Promise.all([
    getProfile(user),
    getHomePoints(user),
    getTranslations("Profile"),
    getTranslations("Orders"),
    getFormatter(),
    getTranslations("Points"),
    getTranslations("Notifications"),
    getTranslations("Nav"),
    getLeaderboardSettings(user),
    getTranslations("LeaderboardSettings"),
  ]);

  const publicName = profile?.displayName?.trim() || null;
  const initials = initialsOf(publicName);
  const memberSince = profile && format.dateTime(profile.createdAt, { month: "long", year: "numeric" });

  const trips = [
    { href: "/viaggi", label: tNav("trips"), hint: t("tripsHint") },
    { href: "/gruppi", label: tNav("groups"), hint: t("groupsHint") },
    { href: "/chat", label: t("conversations"), hint: t("conversationsHint") },
  ] as const;

  const activity = [
    { href: "/punti", label: tPoints("title"), hint: t("pointsHint") },
    { href: "/notifiche", label: tNotifications("title"), hint: t("notificationsHint") },
  ] as const;

  return (
    <PageContainer>
      <PageHeader title={t("title")} />

      <header className="flex items-center gap-4">
        <span className="is-avatar" aria-hidden="true">
          {initials ?? <User className="size-6" aria-hidden="true" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-body font-semibold text-pretty">{publicName ?? t("noPublicName")}</p>
          <p className="text-body-s text-lava-muted break-all">{user.email}</p>
          {memberSince && <p className="text-caption text-lava-muted">{t("memberSinceLabel", { date: memberSince })}</p>}
        </div>
        <Link href="/punti" className="shrink-0 no-underline">
          <PointsPill points={points ?? 0} />
        </Link>
      </header>

      <section aria-labelledby="profile-account" className="flex flex-col gap-4">
        <h2 id="profile-account" className="text-heading-3">
          {t("accountHeading")}
        </h2>
        <dl className="is-settings">
          <div className="is-setting">
            <dt className="is-setting__label">{t("publicName")}</dt>
            <dd className="is-setting__value">{publicName ?? "—"}</dd>
          </div>
          <div className="is-setting">
            <dt className="is-setting__label">{t("email")}</dt>
            <dd className="is-setting__value">{user.email ?? "—"}</dd>
          </div>
          {profile?.role === "admin" && (
            <div className="is-setting">
              <dt className="is-setting__label">{t("role")}</dt>
              <dd className="is-setting__value">{t("roleAdmin")}</dd>
            </div>
          )}
        </dl>
      </section>

      <section aria-labelledby="profile-trips" className="flex flex-col gap-4">
        <h2 id="profile-trips" className="text-heading-3">
          {t("sectionTrips")}
        </h2>
        <ul className="is-settings">
          {trips.map(({ href, label, hint }) => (
            <li key={href}>
              <Link href={href} className="is-setting">
                <span className="is-setting__label">{label}</span>
                <span className="is-setting__value">{hint}</span>
                <ChevronRight aria-hidden="true" className="is-setting__action size-5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="profile-purchases" className="flex flex-col gap-4">
        <h2 id="profile-purchases" className="text-heading-3">
          {t("sectionPurchases")}
        </h2>
        <ul className="is-settings">
          <li>
            <Link href="/ordini" className="is-setting">
              <span className="is-setting__label">{tOrders("title")}</span>
              <span className="is-setting__value">{t("ordersHint")}</span>
              <ChevronRight aria-hidden="true" className="is-setting__action size-5" />
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="profile-activity" className="flex flex-col gap-8">
        <h2 id="profile-activity" className="text-heading-3">
          {t("sectionActivity")}
        </h2>
        <ul className="is-settings">
          {activity.map(({ href, label, hint }) => (
            <li key={href}>
              <Link href={href} className="is-setting">
                <span className="is-setting__label">{label}</span>
                <span className="is-setting__value">{hint}</span>
                <ChevronRight aria-hidden="true" className="is-setting__action size-5" />
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h3 id="profile-leaderboard" className="text-heading-3">
              {tLeaderboard("title")}
            </h3>
            <p className="text-body-s text-lava-muted">{tLeaderboard("intro")}</p>
          </div>
          <LeaderboardSettings
            optOut={leaderboard.optOut}
            displayName={leaderboard.displayName}
            publicName={leaderboard.publicName}
          />
        </div>
      </section>

      <section aria-labelledby="profile-preferences" className="flex flex-col gap-4">
        <h2 id="profile-preferences" className="text-heading-3">
          {t("sectionPreferences")}
        </h2>
        <ul className="is-settings">
          <li>
            <Link href="/preferenze" className="is-setting">
              <span className="is-setting__label">{t("tastesLabel")}</span>
              <span className="is-setting__value">{t("tastesHint")}</span>
              <ChevronRight aria-hidden="true" className="is-setting__action size-5" />
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="profile-privacy" className="flex flex-col gap-4">
        <h2 id="profile-privacy" className="text-heading-3">
          {t("sectionPrivacy")}
        </h2>
        <ul className="is-settings">
          <li>
            <Link href="/profilo/privacy" className="is-setting">
              <span className="is-setting__label">{t("privacyLink")}</span>
              <span className="is-setting__value">{t("privacyHint")}</span>
              <ChevronRight aria-hidden="true" className="is-setting__action size-5" />
            </Link>
          </li>
        </ul>
      </section>

      <form action={signOut} className="flex flex-col items-start gap-3 border-t border-divider pt-8">
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="ghost" size="sm">
          {tNav("logout")}
        </Button>
      </form>
    </PageContainer>
  );
}
