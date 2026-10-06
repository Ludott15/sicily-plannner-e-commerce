import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { Button, ButtonLink } from "@/components/design";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProfile, requireUser } from "@/server/auth";
import { signOut } from "@/server/auth/actions";

// Profilo. Un ospite (sessione anonima) vede come salvare il suo account con l'email e il
// codice: lo user id resta lo stesso, quindi i viaggi creati da ospite restano suoi.
export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();

  if (user.is_anonymous) {
    const t = await getTranslations("Guest");
    return (
      <section className="mx-auto w-full max-w-xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>
              <h1>{t("title")}</h1>
            </CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-8">
            <EmailCodeForm mode="guest" locale={locale} />
            <form action={signOut} className="flex flex-col items-start gap-2 border-t border-divider pt-6">
              <input type="hidden" name="locale" value={locale} />
              <p className="text-body-s text-lava-muted">{t("signOutWarning")}</p>
              <Button type="submit" variant="ghost" size="sm">
                {t("signOut")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    );
  }

  const [profile, t, format] = await Promise.all([
    getProfile(user),
    getTranslations("Profile"),
    getFormatter(),
  ]);

  const rows = [
    [t("email"), user.email],
    [t("displayName"), profile?.displayName],
    [t("role"), profile?.role],
    [t("memberSince"), profile && format.dateTime(profile.createdAt, { dateStyle: "long" })],
  ] as const;

  return (
    <section className="mx-auto w-full max-w-xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{t("title")}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <ButtonLink href="/preferenze" variant="secondary" size="sm" className="mt-6">
            {t("preferences")}
          </ButtonLink>
        </CardContent>
      </Card>
    </section>
  );
}
