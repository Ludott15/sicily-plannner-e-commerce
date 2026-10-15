"use client";

import { useTranslations } from "next-intl";
import { InterestChip, PreferenceScale, type Domain } from "@/components/design";
import { SICILY_AIRPORT_CODES } from "@/lib/flights/airports";
import { NEUTRAL } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import type { OnboardingAnswers } from "@/server/personalization/data";

// Campi delle risposte, usati dall'onboarding (una domanda per schermata) e dalla pagina
// Preferenze (tutte insieme). Ogni campo riceve le risposte e una funzione per cambiarle.

export type Interest = { key: string; label: string; domain?: Domain };
type FieldProps = { answers: OnboardingAnswers; set: (patch: Partial<OnboardingAnswers>) => void };

export const DAYS = [1, 2, 3, 4, 5, 6, 7, 10, 14];
const BUDGETS: (number | null)[] = [30, 60, 100, 150, null];
const PACES = ["relaxed", "balanced", "intense"] as const;
const PARTIES = ["solo", "couple", "family", "friends"] as const;
const CARS = ["own", "rental", "none"] as const;

export function DaysField({ answers, set }: FieldProps) {
  const t = useTranslations("Onboarding");
  const months = t.raw("months") as string[];
  return (
    <div className="flex flex-col gap-6">
      <Options
        legend={t("daysLegend")}
        options={DAYS.map((d) => ({ value: String(d), label: t("daysOption", { count: d }) }))}
        value={answers.days === null ? "" : String(answers.days)}
        onChange={(v) => set({ days: Number(v) })}
      />
      <fieldset>
        <legend className="text-body-s font-semibold">{t("monthsLegend")}</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {months.map((label, i) => (
            <InterestChip
              key={label}
              label={label}
              pressed={answers.months.includes(i + 1)}
              onPressedChange={(on) =>
                set({ months: on ? [...answers.months, i + 1] : answers.months.filter((m) => m !== i + 1) })
              }
            />
          ))}
        </div>
        <p className="mt-2 text-body-s text-lava-muted">{t("monthsHint")}</p>
      </fieldset>
    </div>
  );
}

// Interessi: la selezione è separata dai pesi. Un interesse scelto parte da 3; deselezionarlo
// toglie la riga dalla domanda 3, mettere il peso a 0 no ("Non conta").
export function InterestsField({ answers, set, interests }: FieldProps & { interests: Interest[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {interests.map((i) => {
        const chosen = answers.interests.includes(i.key);
        return (
          <InterestChip
            key={i.key}
            label={i.label}
            domain={i.domain}
            pressed={chosen}
            onPressedChange={(on) =>
              set({
                interests: on ? [...answers.interests, i.key] : answers.interests.filter((k) => k !== i.key),
                weights: on ? { ...answers.weights, [i.key]: answers.weights[i.key] ?? NEUTRAL.weight } : answers.weights,
              })
            }
          />
        );
      })}
    </div>
  );
}

export function WeightsField({ answers, set, interests }: FieldProps & { interests: Interest[] }) {
  const t = useTranslations("Onboarding");
  const chosen = interests.filter((i) => answers.interests.includes(i.key));
  if (chosen.length === 0) return <p className="text-body text-lava-muted">{t("weightsEmpty")}</p>;
  return (
    <div className="flex flex-col">
      {chosen.map((i) => (
        <PreferenceScale
          key={i.key}
          label={i.label}
          value={answers.weights[i.key] ?? NEUTRAL.weight}
          onChange={(v) => set({ weights: { ...answers.weights, [i.key]: v } })}
        />
      ))}
    </div>
  );
}

export function PaceField({ answers, set }: FieldProps) {
  const t = useTranslations("Onboarding");
  return (
    <Options
      legend={t("paceTitle")}
      hideLegend
      options={PACES.map((p) => ({ value: p, label: t(`pace.${p}`), detail: t(`paceDetail.${p}`) }))}
      value={answers.pace ?? ""}
      onChange={(v) => set({ pace: v as OnboardingAnswers["pace"] })}
    />
  );
}

export function PartyField({ answers, set }: FieldProps) {
  const t = useTranslations("Onboarding");
  return (
    <Options
      legend={t("partyTitle")}
      hideLegend
      options={PARTIES.map((p) => ({ value: p, label: t(`party.${p}`) }))}
      value={answers.party ?? ""}
      onChange={(v) => set({ party: v as OnboardingAnswers["party"] })}
    />
  );
}

export function AirportField({ answers, set }: FieldProps) {
  const t = useTranslations("Onboarding");
  return (
    <Options
      legend={t("airportTitle")}
      hideLegend
      options={[
        ...SICILY_AIRPORT_CODES.map((a) => ({ value: a, label: t(`airport.${a}`) })),
        { value: "unknown", label: t("airport.unknown") },
      ]}
      value={answers.airport ?? "unknown"}
      onChange={(v) => set({ airport: v === "unknown" ? null : (v as OnboardingAnswers["airport"]) })}
    />
  );
}

export function BudgetCarField({ answers, set }: FieldProps) {
  const t = useTranslations("Onboarding");
  return (
    <div className="flex flex-col gap-6">
      <Options
        legend={t("budgetLegend")}
        options={BUDGETS.map((b) => ({
          value: b === null ? "none" : String(b),
          label: b === null ? t("budgetNone") : t("budgetOption", { amount: b }),
        }))}
        value={answers.budgetPerDayEur === null ? "none" : String(answers.budgetPerDayEur)}
        onChange={(v) => set({ budgetPerDayEur: v === "none" ? null : Number(v) })}
      />
      <Options
        legend={t("carLegend")}
        options={CARS.map((c) => ({ value: c, label: t(`car.${c}`), detail: t(`carDetail.${c}`) }))}
        value={answers.car ?? ""}
        onChange={(v) => set({ car: v as OnboardingAnswers["car"] })}
      />
    </div>
  );
}

// Scelta singola con radio nativi: tastiera e lettori di schermo funzionano senza codice in
// più. Il radio è visivamente nascosto: si clicca l'etichetta, il focus si vede sull'etichetta.
export function Options({
  legend,
  hideLegend = false,
  options,
  value,
  onChange,
}: {
  legend: string;
  hideLegend?: boolean;
  options: { value: string; label: string; detail?: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className={cn("text-body-s font-semibold", hideLegend && "sr-only")}>{legend}</legend>
      <div className={cn("flex flex-wrap gap-2", !hideLegend && "mt-3")}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border-[1.5px] px-4 py-2 text-body has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
              value === o.value ? "border-lava bg-calce-sunk" : "border-border-control bg-calce-raised",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={legend}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span className="font-semibold">{o.label}</span>
            {o.detail && <span className="text-body-s text-lava-muted">{o.detail}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
