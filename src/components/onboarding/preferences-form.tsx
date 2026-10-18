"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, PreferenceScale } from "@/components/design";
import {
  deleteSensitivePreferences,
  savePreferences,
  type ActionError,
  type PreferencesInput,
} from "@/server/personalization/actions";
import type { ExtraPreferences, OnboardingAnswers } from "@/server/personalization/data";
import { InterestsField, PaceField, WeightsField, type Interest } from "./fields";

// Pagina Preferenze: solo i gusti, che valgono per tutti i viaggi (M4 parte 5): interessi con
// i pesi, ritmo, tolleranza al caldo e alla folla, mobilità ridotta e dieta. Giorni, periodo,
// compagnia, aeroporto, budget e auto sono del viaggio e stanno in "Crea il tuo viaggio".
// Mobilità e dieta sono dati sensibili: si compilano solo dopo aver spuntato il consenso
// (testo in Preferences.consentLabel), e si possono cancellare. Lo scoring le usa come
// filtri; la dieta è indicativa.

const DIETS = ["vegetarian", "vegan", "gluten_free", "lactose_free"] as const;

export function PreferencesForm({
  locale,
  interests,
  initial,
  initialExtra,
  hasSensitive,
}: {
  locale: string;
  interests: Interest[];
  initial: OnboardingAnswers;
  initialExtra: ExtraPreferences;
  hasSensitive: boolean;
}) {
  const t = useTranslations("Preferences");
  const tq = useTranslations("Onboarding");
  const [answers, setAnswers] = useState(initial);
  const [extra, setExtra] = useState(initialExtra);
  const [error, setError] = useState<ActionError["code"] | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<OnboardingAnswers>) => setAnswers((a) => ({ ...a, ...patch }));
  const setX = (patch: Partial<ExtraPreferences>) => setExtra((x) => ({ ...x, ...patch }));

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await savePreferences({
        locale,
        interests: answers.interests,
        weights: answers.weights,
        pace: answers.pace,
        ...extra,
        diet: extra.diet as PreferencesInput["diet"],
      });
      if (result?.status === "error") setError(result.code);
    });
  }

  function clearSensitive() {
    setError(null);
    startTransition(async () => {
      const result = await deleteSensitivePreferences({ locale });
      if (result?.status === "error") setError(result.code);
    });
  }

  const section = (id: string, title: string, children: ReactNode) => (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-divider pt-6">
      <h2 id={id} className="is-display text-heading-2">
        {title}
      </h2>
      {children}
    </section>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-8">
      {section("interessi", tq("interestsTitle"), <InterestsField answers={answers} set={set} interests={interests} />)}
      {section("pesi", tq("weightsTitle"), <WeightsField answers={answers} set={set} interests={interests} />)}
      {section("ritmo", tq("paceTitle"), <PaceField answers={answers} set={set} />)}
      {section(
        "tolleranze",
        t("tolerancesTitle"),
        <div className="flex flex-col">
          <PreferenceScale label={t("heat")} value={extra.heatTolerance ?? 0} onChange={(v) => setX({ heatTolerance: v })} />
          <PreferenceScale label={t("crowd")} value={extra.crowdTolerance ?? 0} onChange={(v) => setX({ crowdTolerance: v })} />
        </div>,
      )}
      {section(
        "esigenze",
        t("needsTitle"),
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="flex min-h-11 items-start gap-3 text-body">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0 accent-lava"
                checked={extra.sensitiveConsent}
                aria-describedby="sensitive-consent-detail"
                onChange={(e) =>
                  setX(e.target.checked ? { sensitiveConsent: true } : { sensitiveConsent: false, reducedMobility: false, diet: [] })
                }
              />
              {t("consentLabel")}
            </label>
            <p id="sensitive-consent-detail" className="pl-8 text-body-s text-lava-muted">
              {t("consentDetail")}
            </p>
          </div>
          <fieldset disabled={!extra.sensitiveConsent} className="flex flex-col gap-3 disabled:opacity-60">
            <legend className="sr-only">{t("needsTitle")}</legend>
            <label className="flex min-h-11 items-center gap-3 text-body">
              <input
                type="checkbox"
                className="size-5 accent-lava"
                checked={extra.reducedMobility}
                onChange={(e) => setX({ reducedMobility: e.target.checked })}
              />
              {t("reducedMobility")}
            </label>
            <p className="text-body-s font-semibold">{t("dietLegend")}</p>
            <div className="flex flex-wrap gap-x-6">
              {DIETS.map((d) => (
                <label key={d} className="flex min-h-11 items-center gap-3 text-body">
                  <input
                    type="checkbox"
                    className="size-5 accent-lava"
                    checked={extra.diet.includes(d)}
                    onChange={(e) => setX({ diet: e.target.checked ? [...extra.diet, d] : extra.diet.filter((x) => x !== d) })}
                  />
                  {t(`diet.${d}`)}
                </label>
              ))}
            </div>
          </fieldset>
          {hasSensitive && (
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={clearSensitive} disabled={pending}>
                {t("deleteSensitive")}
              </Button>
            </div>
          )}
        </div>,
      )}
      {error && (
        <p role="alert" className="text-body-s text-danger">
          {tq(`errors.${error}`)}
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
