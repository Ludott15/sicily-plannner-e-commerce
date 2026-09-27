"use client";

import { useRef, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";

// PreferenceScale (docs/design/components/PreferenceScale/README.md)
// Scala a cinque punti, nessun punto pieno = 0; il valore è preference_weights.explicit.
// Gruppo di radio: cliccare il punto 3 riempie 1-3; cliccare di nuovo il punto pieno
// più alto lo azzera. Punti da 36px, 44px di area toccabile, pieni in lava.
// Semantica: aria-checked solo sul valore scelto (un radiogroup ha un solo radio
// selezionato); il riempimento dei punti precedenti è visivo (data-filled).

const STEPS = [1, 2, 3, 4, 5] as const;

export function PreferenceScale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("Design");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(n: number) {
    onChange(n);
    refs.current[Math.max(n, 1) - 1]?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? Math.min(value + 1, 5)
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? Math.max(value - 1, 0)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? 5
              : null;
    if (next === null) return;
    e.preventDefault();
    select(next);
  }

  return (
    <div className="is-scale">
      <span className="is-scale__label">{label}</span>
      <div className="is-scale__pips" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
        {STEPS.map((n, i) => (
          <button
            key={n}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            className="is-scale__pip"
            aria-checked={value === n}
            data-filled={n <= value}
            aria-label={t("scaleValue", { n })}
            tabIndex={n === Math.max(value, 1) ? 0 : -1}
            style={{ "--pip-i": i } as React.CSSProperties}
            onClick={() => onChange(n === value ? 0 : n)}
          />
        ))}
      </div>
    </div>
  );
}
