"use client";

import { startTransition, useActionState, useEffect, useId, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/design";
import { useRouter } from "@/lib/i18n/navigation";
import { submitReviewAction } from "@/server/gamification/actions";

// Modulo della recensione (passo 5.1): voto 1-5, testo, contatore con la soglia del premio.
// Il invio parte da onSubmit con startTransition (non da <form action>), così il testo
// resta nel campo se il server risponde con un errore.

const MAX_TEXT_CHARS = 4000;
const RATINGS = [1, 2, 3, 4, 5] as const;

const TEXTAREA =
  "min-h-32 w-full rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 py-2 text-body text-lava placeholder:text-lava-muted";

export function ReviewForm({
  activityId,
  minChars,
  points,
  initial,
}: {
  activityId: string;
  minChars: number;
  points: number;
  initial: { rating: number; body: string } | null;
}) {
  const t = useTranslations("Reviews");
  const locale = useLocale();
  const router = useRouter();
  const ids = { title: useId(), text: useId(), hint: useId(), messages: useId() };
  const [state, dispatch, pending] = useActionState(submitReviewAction, { status: "idle" });
  const [rating, setRating] = useState<number>(initial?.rating ?? 0);
  const [text, setText] = useState<string>(initial?.body ?? "");

  // Il voto e il testo appena salvati compaiono nell'elenco delle recensioni.
  useEffect(() => {
    if (state.status === "saved") router.refresh();
  }, [state, router]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    startTransition(() => dispatch({ activityId, rating, text, locale }));
  }

  const length = text.trim().length;
  const errorCode = state.status === "error" ? state.code : null;
  const textInvalid = errorCode === "invalid_text" || errorCode === "invalid";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" aria-labelledby={ids.title}>
      <h3 id={ids.title} className="is-display text-heading-2">{initial ? t("form.updateTitle") : t("form.title")}</h3>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-body-s font-semibold">{t("form.rating")}</legend>
        <div className="flex flex-wrap gap-2">
          {RATINGS.map((value) => (
            <label
              key={value}
              className="flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-sm border-[1.5px] border-border-control bg-calce-raised px-3 text-body has-[:checked]:border-lava has-[:checked]:font-semibold"
            >
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="size-5 accent-lava"
                required
              />
              {t("form.ratingOption", { n: value })}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.text} className="text-body-s font-semibold">
          {t("form.text")}
        </label>
        <textarea
          id={ids.text}
          name="text"
          maxLength={MAX_TEXT_CHARS}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-invalid={textInvalid}
          aria-describedby={ids.hint}
          className={TEXTAREA}
        />
        <p id={ids.hint} aria-live="polite" className="text-caption text-lava-muted">
          {length >= minChars
            ? t("form.rewardReached", { points })
            : t("form.rewardMissing", { missing: minChars - length, points })}
        </p>
      </div>

      <div id={ids.messages} className="flex flex-col gap-3">
        {state.status === "error" && (
          <p role="alert" className="rounded-sm border-[1.5px] border-danger bg-calce-raised px-4 py-3 text-body">
            <span className="font-semibold text-danger">{t(`errors.${state.code}`)}</span>
          </p>
        )}
        {state.status === "saved" && (
          <p role="status" className="rounded-sm border-[1.5px] border-border-control bg-calce-raised px-4 py-3 text-body">
            {state.rewarded ? t("form.savedRewarded", { points }) : t("form.saved")}
          </p>
        )}
      </div>

      <div>
        <Button type="submit" variant="primary" disabled={pending || rating === 0 || length === 0}>
          {pending ? t("form.submitting") : initial ? t("form.update") : t("form.submit")}
        </Button>
      </div>
    </form>
  );
}
