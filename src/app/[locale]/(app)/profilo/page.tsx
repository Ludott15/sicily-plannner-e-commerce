import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProfile, requireUser } from "@/server/auth";

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const [profile, t, format] = await Promise.all([
    getProfile(user.id),
    getTranslations("Profile"),
    getFormatter(),
  ]);

  const rows = [
    [t("email"), user.email],
    [t("displayName"), profile?.display_name],
    [t("role"), profile?.role],
    [t("memberSince"), profile && format.dateTime(new Date(profile.created_at), { dateStyle: "long" })],
  ] as const;

  return (
    <section className="mx-auto w-full max-w-xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
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
        </CardContent>
      </Card>
    </section>
  );
}
