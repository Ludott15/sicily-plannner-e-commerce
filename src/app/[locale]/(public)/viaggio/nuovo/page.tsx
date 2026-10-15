import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink, interestDomain } from "@/components/design";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { TripForm } from "@/components/onboarding/trip-form";
import { getUser } from "@/server/auth";
import { listInterests } from "@/server/catalog/queries";
import { safeNextPath } from "@/server/auth/redirect";
import { EMPTY_ANSWERS, getSavedPreferences } from "@/server/personalization/data";

// "Crea il tuo viaggio" (M4 parte 5). Senza gusti completati (profiles.onboarding_completed_at):
// il percorso di sette domande, anche senza account. Con i gusti completati: una sola
// schermata "Il tuo prossimo viaggio" con giorni, periodo, compagnia, aeroporto, budget e
// auto, precompilati con gli ultimi valori usati, e sopra il riepilogo dei gusti con il link
// alle Preferenze. Pagina personale: non indicizzata.
// next: dove portare a onboarding completato (per esempio un invito a un gruppo). Solo percorsi interni.
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Onboarding" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function NewTripPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next } = await searchParams;
  const nextPath = safeNextPath(next, "") || undefined;

  const [user, rows] = await Promise.all([getUser(), listInterests()]);
  const saved = user ? await getSavedPreferences(user) : null;
  const interests = rows.map((r) => ({
    key: r.key,
    label: locale === "en" ? r.labelEn : r.labelIt,
    domain: interestDomain(r.key),
  }));

  if (!saved?.completed) {
    return (
      <OnboardingFlow
        locale={locale}
        interests={interests}
        initial={EMPTY_ANSWERS}
        needsSession={!user}
        nextPath={nextPath}
      />
    );
  }

  const [t, tDesign] = await Promise.all([getTranslations("Onboarding"), getTranslations("Design")]);
  const words = tDesign.raw("scaleWords") as string[];
  const label = new Map(interests.map((i) => [i.key, i.label]));
  const tastes = saved.interests
    .map((key) => ({ key, weight: saved.weights[key] ?? 0 }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));

  const summary = (
    <section aria-labelledby="gusti" className="flex flex-col gap-3 rounded-lg border border-card-edge bg-calce-raised p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="gusti" className="text-body font-semibold">
          {t("tastesTitle")}
        </h2>
        <ButtonLink href="/preferenze" variant="ghost" size="sm">
          {t("editTastes")}
        </ButtonLink>
      </div>
      {tastes.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body-s">
          {tastes.map((x) => (
            <li key={x.key}>
              {label.get(x.key) ?? x.key} · <span className="text-lava-muted">{words[x.weight]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-s text-lava-muted">{t("tastesNone")}</p>
      )}
      {saved.pace && <p className="text-body-s text-lava-muted">{t("tastesPace", { pace: t(`pace.${saved.pace}`) })}</p>}
    </section>
  );

  const initial = {
    ...EMPTY_ANSWERS,
    days: saved.days,
    months: saved.months,
    party: saved.party,
    airport: saved.airport,
    budgetPerDayEur: saved.budgetPerDayEur,
    car: saved.car,
  };
  return <TripForm locale={locale} initial={initial} summary={summary} />;
}
