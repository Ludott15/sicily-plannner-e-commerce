"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { shouldSuggestAlternatives } from "@/lib/group-votes";

// VoteButton (docs/design/components/VoteButton/README.md)
// Pollice su o giù con il numero di voti: icona e numero sempre insieme, il colore
// non porta il significato. Il proprio voto è aria-pressed e appare pieno lava.
// 44px minimi. Etichetta accessibile con azione e conteggio: "Mi piace, 3 voti".

export function VoteButton({
  kind,
  count,
  pressed,
  onPressedChange,
}: {
  kind: "up" | "down";
  count: number;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  const t = useTranslations("Design");
  const Icon = kind === "up" ? ThumbsUp : ThumbsDown;
  return (
    <button
      type="button"
      className="is-vote"
      aria-pressed={pressed}
      aria-label={t(kind === "up" ? "voteUp" : "voteDown", { count })}
      onClick={() => onPressedChange(!pressed)}
    >
      <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
      {/* key: il numero rientra con lo scorrimento verticale di 6px a ogni cambio */}
      <span key={count} className="is-vote__count">
        {count}
      </span>
    </button>
  );
}

// La regola della nota vive in src/lib/group-votes.ts (condivisa con lo scoring di gruppo).
export { shouldSuggestAlternatives };

// Voti di una tappa nei viaggi di gruppo, con la nota sulle alternative.
export function StopVotes({
  up,
  down,
  members,
  myVote,
  onVote,
  alternatives = 0,
}: {
  up: number;
  down: number;
  members: number;
  myVote: "up" | "down" | null;
  onVote: (vote: "up" | "down" | null) => void;
  alternatives?: number;
}) {
  const t = useTranslations("Design");
  return (
    <>
      <div className="is-stop__votes">
        <VoteButton kind="up" count={up} pressed={myVote === "up"} onPressedChange={(p) => onVote(p ? "up" : null)} />
        <VoteButton
          kind="down"
          count={down}
          pressed={myVote === "down"}
          onPressedChange={(p) => onVote(p ? "down" : null)}
        />
      </div>
      {shouldSuggestAlternatives(down, members) && (
        <p className="is-vote-note" role="status">
          {t("voteNote", { against: down, members })}
          {alternatives > 0 && <> {t("voteAlternatives", { count: alternatives })}</>}
        </p>
      )}
    </>
  );
}
