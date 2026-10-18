import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FormNotice } from "@/components/admin/fields";
import { ButtonLink, interestDomain } from "@/components/design";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PreferencesForm } from "@/components/onboarding/preferences-form";
import { requireUser } from "@/server/auth";
import { listInterests } from "@/server/catalog/queries";
import { EMPTY_ANSWERS, getSavedPreferences } from "@/server/personalization/data";

// Preferenze: i gusti, che valgono per tutti i viaggi (M4 parte 5), anche per un ospite. Il
// viaggio (giorni, periodo, compagnia, aeroporto, budget, auto) si sceglie in "Crea il tuo
// viaggio". Senza gusti salvati: una frase e il pulsante per crearli. Pagina personale.
// Intestazione di pagina: il pulsante "Vedi i viaggi" è l'azione secondaria, il form sta sotto.
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
  if (!saved?.completed) {
    return (
      <PageContainer>
        <PageHeader
          title={t("heading")}
          subtitle={t("empty")}
          primaryAction={
            <ButtonLink href="/viaggio/nuovo" variant="primary">
              {t("createTrip")}
            </ButtonLink>
          }
        />
      </PageContainer>
    );
  }
  const answers = { ...EMPTY_ANSWERS, interests: saved.interests, weights: saved.weights, pace: saved.pace };
  const extra = {
    reducedMobility: saved.reducedMobility,
    diet: saved.diet,
    heatTolerance: saved.heatTolerance,
    crowdTolerance: saved.crowdTolerance,
    sensitiveConsent: saved.sensitiveConsent,
  };

  return (
    <PageContainer>
      <PageHeader
        title={t("heading")}
        subtitle={t("subtitle")}
        primaryAction={
          <ButtonLink href="/viaggio/proposte" variant="secondary">
            {t("seeTrips")}
          </ButtonLink>
        }
      />
      <FormNotice message={salvate ? t("saved") : cancellati ? t("deleted") : null} />
      <PreferencesForm
        locale={locale}
        interests={interests}
        initial={answers}
        initialExtra={extra}
        hasSensitive={extra.sensitiveConsent}
      />
    </PageContainer>
  );
}
