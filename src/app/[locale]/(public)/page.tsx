import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink } from "@/components/design";
import { getProfile, getUser } from "@/server/auth";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, user] = await Promise.all([getTranslations("Home"), getUser()]);
  const profile = user ? await getProfile(user) : null;

  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center gap-6 px-4 py-12 md:px-16 md:py-24">
      {user && <p className="text-body text-lava-muted">{t("greeting", { name: profile?.displayName ?? user.email ?? "" })}</p>}
      <h1 className="is-display max-w-3xl text-display-xl">{t("title")}</h1>
      <p className="max-w-2xl text-body-l text-pretty text-lava-muted">{t("subtitle")}</p>
      {/* Un solo bottone principale per vista (Button/README.md). */}
      <div className="flex flex-wrap gap-3">
        {!user && (
          <ButtonLink href="/login" variant="primary">
            {t("cta")}
          </ButtonLink>
        )}
        <ButtonLink href="/attivita" variant="secondary">
          {t("exploreActivities")}
        </ButtonLink>
        <ButtonLink href="/itinerari" variant="secondary">
          {t("exploreItineraries")}
        </ButtonLink>
      </div>
    </section>
  );
}
