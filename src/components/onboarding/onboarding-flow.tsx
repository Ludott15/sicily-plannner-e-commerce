"use client";

import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Turnstile } from "@/components/auth/turnstile";
import { Button } from "@/components/design";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { NEUTRAL, QUESTIONS, type Question } from "@/lib/onboarding";
import { submitOnboarding, type ActionError } from "@/server/personalization/actions";
import type { OnboardingAnswers } from "@/server/personalization/data";
import {
  AirportField,
  BudgetCarField,
  DaysField,
  InterestsField,
  PaceField,
  PartyField,
  WeightsField,
  type Interest,
} from "./fields";

// Onboarding (schemi.md, "Onboarding delle preferenze"; mockup OnboardingMobile): una domanda
// per schermata, 7 schermate, barra di avanzamento in lava, ogni schermata si può saltare con
// un valore neutro (src/lib/onboarding.ts, docs/spec.md).
// Ogni domanda ha il suo indirizzo (?domanda=N): il tasto Indietro del browser porta alla
// precedente. Le risposte restano nel browser (localStorage) fino all'invio, così un
// ricaricamento non le perde. Chi non ha ancora una sessione la riceve da ospite all'invio.

export const DRAFT_KEY = "isula:onboarding";
const TOTAL = QUESTIONS.length;

// Cosa vale saltare ogni domanda.
const SKIP: Record<Question, (a: OnboardingAnswers) => Partial<OnboardingAnswers>> = {
  days: () => ({ days: null, months: [] }),
  interests: () => ({ interests: [], weights: {} }),
  weights: (a) => ({ weights: Object.fromEntries(a.interests.map((k) => [k, NEUTRAL.weight])) }),
  pace: () => ({ pace: null }),
  party: () => ({ party: null }),
  airport: () => ({ airport: null }),
  budget: () => ({ budgetPerDayEur: null, car: null }),
};

function readDraft(): OnboardingAnswers | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as OnboardingAnswers) : null;
  } catch {
    return null;
  }
}

function writeDraft(answers: OnboardingAnswers | null) {
  try {
    if (answers) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Archiviazione non disponibile (navigazione privata): le risposte restano in memoria.
  }
}

// nextPath (facoltativo, già validato con safeNextPath dalla pagina) è dove andare a onboarding
// completato, per esempio l'invito a un gruppo; senza, la pagina dei tre viaggi.
export function OnboardingFlow({
  locale,
  interests,
  initial,
  needsSession,
  nextPath,
}: {
  locale: string;
  interests: Interest[];
  initial: OnboardingAnswers;
  needsSession: boolean;
  nextPath?: string;
}) {
  const t = useTranslations("Onboarding");
  const router = useRouter();
  const params = useSearchParams();
  const step = Math.min(TOTAL, Math.max(1, Number(params.get("domanda")) || 1)) - 1;
  const question = QUESTIONS[step]!;
  const [answers, setAnswers] = useState<OnboardingAnswers>(initial);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  // Consenso alla profilazione (passo 8.2): non fa parte della bozza. undefined = nessuna scelta.
  const [profiling, setProfiling] = useState<boolean | undefined>(undefined);
  const [error, setError] = useState<ActionError["code"] | null>(null);
  const [pending, startTransition] = useTransition();
  const last = step === TOTAL - 1;

  // Bozza del browser: vince sulle risposte salvate finché non si invia.
  useEffect(() => {
    const draft = readDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la bozza esiste solo nel browser
    if (draft) setAnswers(draft);
  }, []);

  const set = (patch: Partial<OnboardingAnswers>) =>
    setAnswers((a) => {
      const next = { ...a, ...patch };
      writeDraft(next);
      return next;
    });

  const goTo = (index: number) =>
    router.push({
      pathname: "/viaggio/nuovo",
      query: { domanda: String(index + 1), ...(nextPath ? { next: nextPath } : {}) },
    });

  function submit(final: OnboardingAnswers) {
    setError(null);
    startTransition(async () => {
      writeDraft(final);
      const result = await submitOnboarding({
        locale,
        ...final,
        captchaToken: captchaToken ?? undefined,
        next: nextPath,
        profilingConsent: profiling,
      });
      // In caso di successo l'azione porta ai tre viaggi, che tolgono la bozza (ClearDraft).
      if (result?.status === "error") {
        setError(result.code);
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1);
      }
    });
  }

  function next() {
    if (last) submit(answers);
    else goTo(step + 1);
  }

  function skip() {
    const skipped = { ...answers, ...SKIP[question](answers) };
    set(SKIP[question](answers));
    if (last) submit(skipped);
    else goTo(step + 1);
  }

  const screens: Record<Question, { title: string; hint?: string; body: ReactNode }> = {
    days: { title: t("daysTitle"), hint: t("daysHint"), body: <DaysField answers={answers} set={set} /> },
    interests: {
      title: t("interestsTitle"),
      hint: t("interestsHint"),
      body: <InterestsField answers={answers} set={set} interests={interests} />,
    },
    weights: {
      title: t("weightsTitle"),
      hint: t("weightsHint"),
      body: <WeightsField answers={answers} set={set} interests={interests} />,
    },
    pace: { title: t("paceTitle"), body: <PaceField answers={answers} set={set} /> },
    party: { title: t("partyTitle"), hint: t("partyHint"), body: <PartyField answers={answers} set={set} /> },
    airport: { title: t("airportTitle"), hint: t("airportHint"), body: <AirportField answers={answers} set={set} /> },
    budget: { title: t("budgetTitle"), hint: t("budgetHint"), body: <BudgetCarField answers={answers} set={set} /> },
  };
  const screen = screens[question];
  // Domanda 1: Avanti solo dopo aver scelto i giorni (o con Salta).
  const canGoOn = !(question === "days" && answers.days === null);

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 py-8 md:gap-12 md:py-14">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 text-body-s text-lava-muted">
          <span>{t("progress", { step: step + 1, total: TOTAL })}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={skip}
            disabled={pending || (last && needsSession && !captchaToken)}
          >
            {t("skip")}
          </Button>
        </div>
        <div
          className="h-1 w-full overflow-hidden rounded-pill bg-calce-sunk"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL}
          aria-valuenow={step + 1}
          aria-label={t("progress", { step: step + 1, total: TOTAL })}
        >
          <div className="h-full bg-lava" style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
        </div>
      </div>

      <div className="flex max-w-[680px] flex-col gap-3">
        <h1 className="is-display text-display-l text-balance">{screen.title}</h1>
        {screen.hint && <p className="text-body-l text-pretty text-lava-muted">{screen.hint}</p>}
      </div>

      {screen.body}

      {last && <ProfilingQuestion value={profiling} onChange={setProfiling} />}

      {last && needsSession && (
        <Turnstile key={captchaKey} locale={locale} onToken={setCaptchaToken} onError={() => setError("captcha_failed")} />
      )}
      {error && (
        <p role="alert" className="text-body-s text-danger">
          {t(`errors.${error}`)}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-4 border-t border-divider pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={() => goTo(step - 1)}>
              {t("back")}
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="primary"
            onClick={next}
            disabled={pending || !canGoOn || (last && needsSession && !captchaToken)}
            aria-busy={pending}
          >
            {last ? t("finish") : question === "interests" ? t("nextChosen", { count: answers.interests.length }) : t("next")}
          </Button>
        </div>
        {step === 0 && (
          // Informativa sotto i pulsanti della prima domanda.
          <p className="text-caption text-lava-muted">
            {t.rich("privacyNote", {
              privacy: (chunks) => <Link href="/privacy">{chunks}</Link>,
            })}
          </p>
        )}
      </div>
    </section>
  );
}

// Ultima domanda, separata dalle altre: il consenso alla profilazione. Nessuna risposta
// preselezionata; "Salta" o nessuna scelta non registrano nulla nel registro dei consensi.
function ProfilingQuestion({ value, onChange }: { value: boolean | undefined; onChange: (next: boolean) => void }) {
  const t = useTranslations("Onboarding");
  const id = useId();
  const headingId = `${id}-profiling`;
  const options = [
    { granted: true, label: t("profilingYes") },
    { granted: false, label: t("profilingNo") },
  ] as const;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 border-t border-divider pt-8">
      <div className="flex flex-col gap-3">
        <h2 id={headingId} className="is-display text-heading-2 text-balance">
          {t("profilingTitle")}
        </h2>
        <p className="text-body text-pretty text-lava-muted">
          {t("profilingHint")}{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            {t("privacyLink")}
          </Link>
        </p>
      </div>
      <div role="radiogroup" aria-labelledby={headingId} className="flex flex-col gap-3">
        {options.map((option) => (
          <label key={String(option.granted)} className="flex min-h-11 items-center gap-3 text-body">
            <input
              type="radio"
              name={`${id}-profiling`}
              className="size-5 shrink-0 accent-lava"
              checked={value === option.granted}
              onChange={() => onChange(option.granted)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </section>
  );
}

// Sulla pagina dei tre viaggi: l'invio è riuscito, la bozza del browser non serve più.
export function ClearOnboardingDraft() {
  useEffect(() => writeDraft(null), []);
  return null;
}
