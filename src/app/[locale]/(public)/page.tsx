import { getTranslations, setRequestLocale } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";
import { getProfile, getUser } from "@/server/auth";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, user] = await Promise.all([getTranslations("Home"), getUser()]);
  const profile = user ? await getProfile(user) : null;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      {user && (
        <p className="text-muted-foreground">
          {t("greeting", { name: profile?.displayName ?? user.email ?? "" })}
        </p>
      )}
      <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{t("title")}</h1>
      <p className="text-lg text-pretty text-muted-foreground">{t("subtitle")}</p>
      <div className="flex flex-wrap gap-3">
        {!user && (
          <Link href="/login" className={buttonVariants({ size: "lg" })}>
            {t("cta")}
          </Link>
        )}
        <Link href="/attivita" className={buttonVariants({ size: "lg", variant: "outline" })}>
          {t("exploreActivities")}
        </Link>
        <Link href="/itinerari" className={buttonVariants({ size: "lg", variant: "outline" })}>
          {t("exploreItineraries")}
        </Link>
      </div>
    </section>
  );
}
