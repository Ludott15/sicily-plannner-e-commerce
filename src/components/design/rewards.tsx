"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Rewards (docs/design/components/Rewards/README.md): pillola punti e timbri,
// le uniche superfici zagara del prodotto.

const SLOW_MS = 420; // allineato a --dur-slow: il conteggio dura quanto la transizione

// "1.240 punti" (schemi.md, Formati): in italiano Intl non raggruppa sotto le 5 cifre.
const GROUPING = { useGrouping: "always" } as const;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Pillola punti: a riposo zagara-tint con bordo zagara. Quando i punti crescono diventa
// piena (is-points--earned) per dur-slow, conta dal vecchio al nuovo valore e un "+20"
// sale di 12px e svanisce; poi torna a riposo. Con movimento ridotto mostra subito il valore.
export function PointsPill({ points }: { points: number }) {
  const format = useFormatter();
  const t = useTranslations("Design");
  const previous = useRef(points);
  const [shown, setShown] = useState(points);
  const [gain, setGain] = useState<number | null>(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = points;
    if (points <= from || prefersReducedMotion()) {
      setShown(points);
      if (points > from) setGain(points - from);
      return;
    }
    setGain(points - from);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / SLOW_MS, 1);
      setShown(Math.round(from + (points - from) * p));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const reset = setTimeout(() => setGain(null), SLOW_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(reset);
    };
  }, [points]);

  return (
    <span className={cn("is-points", gain !== null && "is-points--earned")} role="img" aria-label={t("pointsAria", { points })}>
      <span className="is-points__coin" aria-hidden="true" />
      <span aria-hidden="true">{format.number(shown, GROUPING)}</span>
      {gain !== null && (
        <span key={points} className="is-points__gain" aria-hidden="true">
          +{format.number(gain, GROUPING)}
        </span>
      )}
    </span>
  );
}

// Rotazione diversa per ogni timbro, tra -6° e 4°, stabile per lo stesso badge.
export function stampRotation(key: string): number {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (hash % 11) - 6;
}

// Timbro da 120px: cerchio zagara con anello tratteggiato, nome di al massimo 16 caratteri
// per riga (si scrive per starci, non si spezza col trattino). Bloccato: calce-sunk, senza
// rotazione, con il progresso. Appena sbloccato (isNew): timbratura una volta sola.
export function Stamp({
  badgeKey,
  name,
  locked = false,
  progress,
  isNew = false,
}: {
  badgeKey: string;
  name: string;
  locked?: boolean;
  progress?: string;
  isNew?: boolean;
}) {
  const t = useTranslations("Design");
  return (
    <div
      className={cn("is-stamp", locked && "is-stamp--locked", isNew && !locked && "is-stamp--new")}
      style={locked ? undefined : ({ "--stamp-rot": `${stampRotation(badgeKey)}deg` } as React.CSSProperties)}
      role="img"
      aria-label={locked ? `${name}: ${t("stampLocked")}${progress ? `, ${progress}` : ""}` : name}
    >
      <span className="is-stamp__name" aria-hidden="true">
        {name}
        {locked && progress && <span className="is-stamp__progress">{progress}</span>}
      </span>
    </div>
  );
}

// Etichetta sulle recensioni che hanno generato punti (public_reviews.rewarded).
// Il premio non dipende dal voto dato.
export function RewardedReviewLabel() {
  const t = useTranslations("Design");
  return <span className="is-tag">{t("rewardedReview")}</span>;
}
