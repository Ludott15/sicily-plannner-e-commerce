import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { Button } from "@/components/design";
import { LeaderboardSettings } from "@/components/leaderboard/leaderboard-settings";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Link } from "@/lib/i18n/navigation";
import { getProfile, requireUser } from "@/server/auth";
import { signOut } from "@/server/auth/actions";
import { getLeaderboardSettings } from "@/server/gamification/leaderboard";

// Profilo (brief 6.1): hub dell'area personale. Intestazione, dati dell'account, poi le sezioni collegate
// (punti, classifica, notifiche, preferenze) e le impostazioni della classifica.
// Un ospite (sessione anonima) vede come salvare il suo account con l'email e il codice: lo user id
// resta lo stesso, quindi i viaggi creati da ospite restano suoi.
export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();

  if (user.is_anonymous) {
    const t = await getTranslations("Guest");
    return (
      <PageContainer>
        <PageHeader title={t("title")} subtitle={t("description")} />
        <EmailCodeForm mode="guest" locale={locale} />
        <form action={signOut} className="flex flex-col items-start gap-2 border-t border-divider pt-8">
          <input type="hidden" name="locale" value={locale} />
          <p className="text-body-s text-lava-muted">{t("signOutWarning")}</p>
          <Button type="submit" variant="ghost" size="sm">
            {t("signOut")}
          </Button>
        </form>
      </PageContainer>
    );
  }

  const [profile, t, format, tPoints, tNotifications, tPreferences, tNav, leaderboard, tLeaderboard] = await Promise.all([
    getProfile(user),
    getTranslations("Profile"),
    getFormatter(),
    getTranslations("Points"),
    getTranslations("Notifications"),
    getTranslations("Preferences"),
    getTranslations("Nav"),
    getLeaderboardSettings(user),
    getTranslations("LeaderboardSettings"),
  ]);

  const rows = [
    [t("email"), user.email],
    [t("displayName"), profile?.displayName],
    [t("role"), profile?.role],
    [t("memberSince"), profile && format.dateTime(profile.createdAt, { dateStyle: "long" })],
  ] as const;

  const hub = [
    { href: "/chat", label: tNav("assistant") },
    { href: "/punti", label: tPoints("title") },
    { href: "/classifica", label: tNav("leaderboard") },
    { href: "/notifiche", label: tNotifications("title") },
    { href: "/preferenze", label: tPreferences("title") },
  ] as const;

  return (
    <PageContainer>
      <PageHeader title={t("title")} />

      <section aria-labelledby="profile-account" className="flex flex-col gap-4">
        <h2 id="profile-account" className="text-heading-3">
          {t("accountHeading")}
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-body-s">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-lava-muted">{label}</dt>
              <dd>{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="profile-hub" className="flex flex-col gap-2">
        <h2 id="profile-hub" className="text-heading-3">
          {t("hubHeading")}
        </h2>
        <ul className="flex flex-col divide-y divide-divider">
          {hub.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-11 items-center justify-between gap-4 py-3 text-body font-medium no-underline hover:underline underline-offset-4"
              >
                {label}
                <span aria-hidden="true" className="text-lava-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="profile-leaderboard" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 id="profile-leaderboard" className="text-heading-3">
            {tLeaderboard("title")}
          </h2>
          <p className="text-body-s text-lava-muted">{tLeaderboard("intro")}</p>
        </div>
        <LeaderboardSettings
          optOut={leaderboard.optOut}
          displayName={leaderboard.displayName}
          publicName={leaderboard.publicName}
        />
      </section>
    </PageContainer>
  );
}
