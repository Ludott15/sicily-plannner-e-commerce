"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

// DayTabs (docs/design/components/DayTabs/README.md)
// Pillole con numero e nome del giorno, scorrevoli in orizzontale.
// "G1 · Noto e costa" su mobile, "Giorno 1 · Noto e costa" su desktop: il nome non si toglie mai.
// Il giorno selezionato è pieno lava con aria-current="true" e su mobile scorre in vista all'apertura.

export function DayTabs({
  days,
  current,
  onSelect,
}: {
  days: { name: string }[];
  current: number;
  onSelect: (index: number) => void;
}) {
  const t = useTranslations("Design");
  const selected = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selected.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // Solo all'apertura: al cambio di giorno la pillola è già visibile.
  }, []);

  return (
    <nav className="is-days" aria-label={t("days")}>
      {days.map((day, i) => (
        <button
          key={i}
          ref={i === current ? selected : undefined}
          type="button"
          className="is-day"
          aria-current={i === current ? "true" : undefined}
          onClick={() => onSelect(i)}
        >
          <span className="is-day__short">{t("dayShort", { n: i + 1, name: day.name })}</span>
          <span className="is-day__long">{t("dayLong", { n: i + 1, name: day.name })}</span>
        </button>
      ))}
    </nav>
  );
}
