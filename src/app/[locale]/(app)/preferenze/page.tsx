import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FormNotice } from "@/components/admin/fields";
import { ButtonLink, interestDomain } from "@/components/design";
import { PreferencesForm } from "@/components/onboarding/preferences-form";
import { requireUser } from "@/server/auth";
import { listInterests } from "@/server/catalog/queries";
import { EMPTY_ANSWERS, getSavedPreferences } from "@/server/personalization/data";

// Preferenze: tutte le risposte modificabili, anche per un ospite. Pagina personale.
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ salvate?: string; cancellati?: string }> };

export async function generateMetadata({ params }: Omit<Props, "searchParams">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Preferences" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function PreferencesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [t, rows, saved, { salvate, cancellati }] = await Promise.all([
    getTranslations("Preferences"),
    listInterests(),
    getSavedPreferences(user),
    searchParams,
  ]);
  const interests = rows.map((r) => ({ key: r.key, label: locale === "en" ? r.labelEn : r.labelIt, domain: interestDomain(r.key) }));
  const answers = saved
    ? {
        days: saved.days,
        months: saved.months,
        interests: saved.interests,
        weights: saved.weights,
        pace: saved.pace,
        party: saved.party,
        airport: saved.airport,
        budgetPerDayEur: saved.budgetPerDayEur,
        car: saved.car,
      }
    : EMPTY_ANSWERS;
  const extra = {
    reducedMobility: saved?.reducedMobility ?? false,
    diet: saved?.diet ?? [],
    heatTolerance: saved?.heatTolerance ?? null,
    crowdTolerance: saved?.crowdTolerance ?? null,
    sensitiveConsent: saved?.sensitiveConsent ?? false,
  };

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="is-display text-display-l">{t("title")}</h1>
        {saved?.completed && (
          <ButtonLink href="/viaggio/proposte" variant="secondary">
            {t("seeTrips")}
          </ButtonLink>
        )}
      </div>
      <FormNotice message={salvate ? t("saved") : cancellati ? t("deleted") : null} />
      <PreferencesForm
        locale={locale}
        interests={interests}
        initial={answers}
        initialExtra={extra}
        hasSensitive={extra.sensitiveConsent}
      />
    </section>
  );
}
