"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Turnstile } from "@/components/auth/turnstile";
import { Button, InterestChip, PendingText, PreferenceScale, type Domain } from "@/components/design";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { submitOnboarding, type OnboardingResult } from "@/server/personalization/actions";
import type { OnboardingAnswers, Party } from "@/server/personalization/data";

// Onboarding (schemi.md, "Onboarding delle preferenze"; mockup OnboardingMobile): una domanda
// per schermata, 6 schermate, barra di avanzamento in lava, ogni schermata si può saltare.
// 1 giorni e periodo · 2 interessi (chip) · 3 quanto contano (scala 0-5) · 4 ritmo ·
// 5 con chi · 6 budget e auto. Alla fine "Ecco tre viaggi pensati per te".
// Chi non ha ancora una sessione la riceve da ospite all'invio (Turnstile).

const STEPS = 6;
const DAYS = [1, 2, 3, 4, 5, 6, 7, 10, 14];
const BUDGETS: (number | null)[] = [30, 60, 100, 150, null];
const PACES = ["relaxed", "balanced", "intense"] as const;
const PARTIES: Party[] = ["solo", "couple", "family", "friends"];
const DEFAULT_WEIGHT = 3;

type Interest = { key: string; label: string; domain?: Domain };

export function OnboardingFlow({
  locale,
  interests,
  initial,
  needsSession,
}: {
  locale: string;
  interests: Interest[];
  initial: OnboardingAnswers;
  needsSession: boolean;
}) {
  const t = useTranslations("Onboarding");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(initial);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [error, setError] = useState<OnboardingResult["code"] | null>(null);
  const [pending, startTransition] = useTransition();
  const months = t.raw("months") as string[];
  const chosen = interests.filter((i) => (answers.weights[i.key] ?? 0) > 0);
  const last = step === STEPS - 1;

  const set = (patch: Partial<OnboardingAnswers>) => setAnswers((a) => ({ ...a, ...patch }));

  function next() {
    if (!last) return setStep((s) => s + 1);
    setError(null);
    startTransition(async () => {
      const result = await submitOnboarding({ locale, ...answers, captchaToken: captchaToken ?? undefined });
      // In caso di successo l'azione porta ai tre viaggi.
      if (result?.status === "error") {
        setError(result.code);
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1);
      }
    });
  }

  const screens: { title: string; hint?: string; body: ReactNode }[] = [
    {
      title: t("daysTitle"),
      hint: t("daysHint"),
      body: (
        <div className="flex flex-col gap-6">
          <Options
            legend={t("daysLegend")}
            options={DAYS.map((d) => ({ value: String(d), label: t("daysOption", { count: d }) }))}
            value={String(answers.days)}
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
      ),
    },
    {
      title: t("interestsTitle"),
      hint: t("interestsHint"),
      body: (
        <div className="flex flex-wrap gap-2">
          {interests.map((i) => (
            <InterestChip
              key={i.key}
              label={i.label}
              domain={i.domain}
              pressed={(answers.weights[i.key] ?? 0) > 0}
              onPressedChange={(on) => set({ weights: { ...answers.weights, [i.key]: on ? DEFAULT_WEIGHT : 0 } })}
            />
          ))}
        </div>
      ),
    },
    {
      title: t("weightsTitle"),
      hint: t("weightsHint"),
      body:
        chosen.length === 0 ? (
          <p className="text-body text-lava-muted">{t("weightsEmpty")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {chosen.map((i) => (
              <PreferenceScale
                key={i.key}
                label={i.label}
                value={answers.weights[i.key] ?? 0}
                onChange={(v) => set({ weights: { ...answers.weights, [i.key]: v } })}
              />
            ))}
          </div>
        ),
    },
    {
      title: t("paceTitle"),
      body: (
        <Options
          legend={t("paceTitle")}
          hideLegend
          options={PACES.map((p) => ({ value: p, label: t(`pace.${p}`), detail: t(`paceDetail.${p}`) }))}
          value={answers.pace}
          onChange={(v) => set({ pace: v as OnboardingAnswers["pace"] })}
        />
      ),
    },
    {
      title: t("partyTitle"),
      hint: t("partyHint"),
      body: (
        <Options
          legend={t("partyTitle")}
          hideLegend
          options={PARTIES.map((p) => ({ value: p, label: t(`party.${p}`) }))}
          value={answers.party ?? ""}
          onChange={(v) => set({ party: v as Party })}
        />
      ),
    },
    {
      title: t("budgetTitle"),
      hint: t("budgetHint"),
      body: (
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
            options={[
              { value: "yes", label: t("carYes") },
              { value: "no", label: t("carNo") },
            ]}
            value={answers.hasCar ? "yes" : "no"}
            onChange={(v) => set({ hasCar: v === "yes" })}
          />
        </div>
      ),
    },
  ];
  const screen = screens[step]!;

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8 md:py-12">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 text-body-s text-lava-muted">
          <span>{t("progress", { step: step + 1, total: STEPS })}</span>
          {!last && (
            <button type="button" className="font-semibold text-lava underline underline-offset-4" onClick={next}>
              {t("skip")}
            </button>
          )}
        </div>
        <div
          className="h-1 w-full overflow-hidden rounded-pill bg-calce-sunk"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS}
          aria-valuenow={step + 1}
          aria-label={t("progress", { step: step + 1, total: STEPS })}
        >
          <div className="h-full bg-lava" style={{ width: `${((step + 1) / STEPS) * 100}%` }} />
        </div>
      </div>

      {step === 0 && (
        // Informativa prima della prima domanda: il testo lo scrive Ludovico (in sospeso).
        <div className="flex flex-col gap-1">
          <PendingText id="onboarding.privacy" />
          <Link href="/privacy" className="text-body-s">
            {t("privacyLink")}
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h1 className="is-display text-display-l">{screen.title}</h1>
        {screen.hint && <p className="text-body-l text-pretty text-lava-muted">{screen.hint}</p>}
      </div>

      {screen.body}

      {last && needsSession && (
        <Turnstile key={captchaKey} locale={locale} onToken={setCaptchaToken} onError={() => setError("captcha_failed")} />
      )}
      {error && (
        <p role="alert" className="text-body-s text-danger">
          {t(`errors.${error}`)}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
            {t("back")}
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="primary"
          onClick={next}
          disabled={pending || (last && needsSession && !captchaToken)}
          aria-busy={pending}
        >
          {last ? t("finish") : step === 1 ? t("nextChosen", { count: chosen.length }) : t("next")}
        </Button>
      </div>
    </section>
  );
}

// Scelta singola con radio nativi: tastiera e lettori di schermo funzionano senza codice in più.
function Options({
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
