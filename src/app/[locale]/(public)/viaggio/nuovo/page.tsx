import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { interestDomain } from "@/components/design";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { getUser } from "@/server/auth";
import { listInterests } from "@/server/catalog/queries";
import { DEFAULT_ANSWERS, getSavedAnswers } from "@/server/personalization/data";

// "Crea il tuo viaggio": sei domande, anche senza account. Con risposte già salvate
// ("Cambia preferenze") l'onboarding riparte da quelle. Pagina personale: non indicizzata.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Onboarding" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function NewTripPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [user, rows] = await Promise.all([getUser(), listInterests()]);
  const saved = user ? await getSavedAnswers(user) : null;
  const interests = rows.map((r) => ({
    key: r.key,
    label: locale === "en" ? r.labelEn : r.labelIt,
    domain: interestDomain(r.key),
  }));
  const initial = saved
    ? {
        days: saved.days,
        months: saved.months,
        weights: saved.weights,
        pace: saved.pace,
        party: saved.party,
        budgetPerDayEur: saved.budgetPerDayEur,
        hasCar: saved.hasCar,
      }
    : DEFAULT_ANSWERS;

  return <OnboardingFlow locale={locale} interests={interests} initial={initial} needsSession={!user} />;
}
