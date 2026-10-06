"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { submitTrip, type ActionError } from "@/server/personalization/actions";
import type { OnboardingAnswers } from "@/server/personalization/data";
import { AirportField, BudgetCarField, DaysField, PartyField } from "./fields";

// "Il tuo prossimo viaggio" (M4 parte 5): chi ha già i gusti sceglie solo il viaggio, in una
// schermata, con gli ultimi valori usati già compilati. Sopra, il riepilogo dei gusti
// (`summary`, reso dal server) con il link alle Preferenze.
export function TripForm({ locale, initial, summary }: { locale: string; initial: OnboardingAnswers; summary: ReactNode }) {
  const t = useTranslations("Onboarding");
  const [answers, setAnswers] = useState(initial);
  const [error, setError] = useState<ActionError["code"] | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<OnboardingAnswers>) => setAnswers((a) => ({ ...a, ...patch }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const { days, months, party, airport, budgetPerDayEur, car } = answers;
      const result = await submitTrip({ locale, days, months, party, airport, budgetPerDayEur, car });
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
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 md:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-display-l">{t("tripTitle")}</h1>
        <p className="text-body-l text-pretty text-lava-muted">{t("tripHint")}</p>
      </div>
      {summary}
      <form onSubmit={submit} className="flex flex-col gap-8">
        {section("giorni", t("daysTitle"), <DaysField answers={answers} set={set} />)}
        {section("compagnia", t("partyTitle"), <PartyField answers={answers} set={set} />)}
        {section("arrivo", t("airportTitle"), <AirportField answers={answers} set={set} />)}
        {section("budget", t("budgetTitle"), <BudgetCarField answers={answers} set={set} />)}
        {error && (
          <p role="alert" className="text-body-s text-danger">
            {t(`errors.${error}`)}
          </p>
        )}
        <div>
          <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
            {t("finish")}
          </Button>
        </div>
      </form>
    </section>
  );
}
